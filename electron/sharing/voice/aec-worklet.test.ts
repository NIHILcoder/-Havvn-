/**
 * Offline validation of the screen-audio echo canceller's DSP (M20).
 *
 * The live 2-instance smoke can't produce a real loopback echo in a headless CDP
 * Electron, so it can't measure cancellation. This drives the ACTUAL worklet code
 * with a SYNTHETIC linear echo (a delayed, scaled, lightly-filtered copy of the
 * reference — exactly what a digital system loopback of the voice call is) and
 * measures ERLE (echo return loss enhancement). A working canceller drives the
 * echo far below the input; a broken/diverging one leaves it (or amplifies).
 */
import { describe, it, expect } from 'vitest';
import { AEC_WORKLET_SOURCE } from './aec-worklet';

/** Instantiate the real AecProcessor from the worklet source with worklet globals stubbed. */
function makeProcessor(taps: number, mu?: number): { process: (i: any, o: any) => boolean } {
  const g = globalThis as any;
  g.sampleRate = 48000;
  g.AudioWorkletProcessor = class { port = { onmessage: null as any, postMessage(): void { /* noop */ } }; };
  let Cls: any;
  g.registerProcessor = (_name: string, cls: any) => { Cls = cls; };
  // eslint-disable-next-line no-new-func
  new Function(AEC_WORKLET_SOURCE)();
  return new Cls({ processorOptions: { taps, ...(mu ? { mu } : {}) } });
}

/** Deterministic PRNG so the test is reproducible. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return (s / 0xffffffff) * 2 - 1; };
}

/** Run a reference + a synthetic echo through the processor and return ERLE (dB)
 *  over the tail (post-convergence). `echoTaps` is the loopback impulse response
 *  applied to a `delay`-shifted reference; `nearGain` is faint "screen content". */
function runErle(opts: { taps: number; delay: number; echoTaps: number[]; nearGain: number; seconds: number; mu?: number }): number {
  const { taps, delay, echoTaps, nearGain, seconds } = opts;
  const p = makeProcessor(taps, opts.mu);
  const SR = 48000, BLK = 128;
  const total = Math.floor(SR * seconds);
  const rRef = rng(1), rNear = rng(999);
  const refHist: number[] = new Array(delay + echoTaps.length + 2).fill(0);
  let echoTail = 0, resTail = 0;
  const tailStart = total - SR; // measure ERLE over the last second
  for (let off = 0; off < total; off += BLK) {
    const n = Math.min(BLK, total - off);
    const nearBlk = new Float32Array(n);
    const refBlk = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = rRef();
      refBlk[i] = x;
      refHist.unshift(x); refHist.pop();
      // Synthetic echo: FIR(echoTaps) applied to the delay-shifted reference.
      let echo = 0;
      for (let k = 0; k < echoTaps.length; k++) echo += echoTaps[k] * refHist[delay + k];
      const near = echo + nearGain * rNear();
      nearBlk[i] = near;
      if (off + i >= tailStart) echoTail += echo * echo;
    }
    const outBlk = new Float32Array(n);
    p.process([[nearBlk], [refBlk]], [[outBlk]]); // inputs: [0]=loopback(near), [1]=reference
    for (let i = 0; i < n; i++) {
      if (off + i >= tailStart) {
        // Residual echo = output minus the near-end content we deliberately added.
        // near = echo + content; ideal out = content, so out-echo... but we don't
        // know content per-sample cheaply; approximate residual as the OUTPUT energy
        // minus the (known-small) content energy is messy. Instead measure ERLE as
        // input-echo energy vs OUTPUT energy directly (content is faint, nearGain low).
        resTail += outBlk[i] * outBlk[i];
      }
    }
  }
  // ERLE ≈ 10 log10( echo power / residual-output power ). Content floor limits the max.
  return 10 * Math.log10((echoTail + 1e-12) / (resTail + 1e-12));
}

describe('screen-audio AEC worklet (NLMS)', () => {
  it('cancels a short-delay linear echo (>12 dB ERLE)', () => {
    const erle = runErle({ taps: 2048, delay: 400, echoTaps: [0.7, 0.25, 0.1], nearGain: 0.02, seconds: 4 });
    console.log(`[aec] short-delay ERLE = ${erle.toFixed(1)} dB`);
    expect(erle).toBeGreaterThan(12);
  }, 30000);

  it('cancels a longer-delay echo within the filter length (>10 dB)', () => {
    const erle = runErle({ taps: 3072, delay: 1500, echoTaps: [0.6, 0.3], nearGain: 0.02, seconds: 5 });
    console.log(`[aec] long-delay ERLE = ${erle.toFixed(1)} dB`);
    expect(erle).toBeGreaterThan(10);
  }, 40000);

  it('processes a 128-sample block within the real-time budget (~2.67ms @48k)', () => {
    const p = makeProcessor(2048);
    const near = new Float32Array(128), ref = new Float32Array(128), out = new Float32Array(128);
    const r = rng(3);
    for (let i = 0; i < 128; i++) { near[i] = r(); ref[i] = r(); }
    // Warm up (JIT), then time many blocks.
    for (let i = 0; i < 200; i++) p.process([[near], [ref]], [[out]]);
    const N = 2000, t0 = performance.now();
    for (let i = 0; i < N; i++) p.process([[near], [ref]], [[out]]);
    const perBlockMs = (performance.now() - t0) / N;
    console.log(`[aec] per-128-sample-block: ${perBlockMs.toFixed(3)} ms (budget 2.67 ms) at 2048 taps`);
    expect(perBlockMs).toBeLessThan(2.67); // must keep up with the audio thread
  }, 30000);

  it('does NOT amplify when the reference is UNCORRELATED with the near signal (guard holds ERLE ≳ 0)', () => {
    // near is independent noise (no echo of the reference) — a broken filter injects
    // anti-signal and drops ERLE below 0; the divergence guard must keep it ≳ 0.
    const p = makeProcessor(2048);
    const SR = 48000, BLK = 128, total = SR * 3;
    const rRef = rng(5), rNear = rng(6);
    let inE = 0, outE = 0; const tail = total - SR;
    for (let off = 0; off < total; off += BLK) {
      const near = new Float32Array(BLK), ref = new Float32Array(BLK), out = new Float32Array(BLK);
      for (let i = 0; i < BLK; i++) { near[i] = rNear() * 0.3; ref[i] = rRef() * 0.3; if (off + i >= tail) inE += near[i] * near[i]; }
      p.process([[near], [ref]], [[out]]);
      for (let i = 0; i < BLK; i++) if (off + i >= tail) outE += out[i] * out[i];
    }
    const erle = 10 * Math.log10((inE + 1e-12) / (outE + 1e-12));
    expect(erle).toBeGreaterThan(-1.5); // never meaningfully worse than passthrough
  }, 30000);

  it('does NOT amplify with a PERIODIC (sine) reference uncorrelated with the near signal', () => {
    // The pathological case the live CDP smoke exposed: the reference is a tone (the
    // fake media device / a strong musical beat) but the near-end loopback carries NO
    // echo of it (call playback goes to a different output device). A sine has strong
    // autocorrelation, so a too-permissive NLMS builds gain at that frequency and makes
    // the output LOUDER than the raw loopback. The divergence guard must keep it ≳
    // passthrough — for an opt-in "may echo faintly" feature it must never echo LOUDER.
    const p = makeProcessor(3072);
    const SR = 48000, BLK = 128, total = SR * 4;
    const rNear = rng(7);
    const f = 440; // A4 reference tone
    let inE = 0, outE = 0; const tail = total - SR;
    for (let off = 0; off < total; off += BLK) {
      const near = new Float32Array(BLK), ref = new Float32Array(BLK), out = new Float32Array(BLK);
      for (let i = 0; i < BLK; i++) {
        const tSample = off + i;
        ref[i] = 0.5 * Math.sin((2 * Math.PI * f * tSample) / SR); // periodic, correlated with itself
        near[i] = rNear() * 0.3;                                    // independent of ref (no echo)
        if (tSample >= tail) inE += near[i] * near[i];
      }
      p.process([[near], [ref]], [[out]]);
      for (let i = 0; i < BLK; i++) if (off + i >= tail) outE += out[i] * out[i];
    }
    const erle = 10 * Math.log10((inE + 1e-12) / (outE + 1e-12));
    console.log(`[aec] periodic-uncorrelated ERLE = ${erle.toFixed(1)} dB (must stay ≳ 0 — never louder)`);
    expect(erle).toBeGreaterThan(-1.0); // hard safety floor: opt-in audio must not echo LOUDER
  }, 40000);
});
