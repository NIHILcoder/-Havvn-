// Acoustic-echo-canceller AudioWorkletProcessor for screen-share audio (M20).
//
// When a member shares SYSTEM audio while in a voice call, the desktop loopback
// capture also contains the call playback (every other member's voice, played to
// this member's output) — so sharing it raw echoes the call back to everyone.
// This worklet removes that echo: input[0] is the loopback (screen content + the
// call echo), input[1] is a REFERENCE — the exact mix of remote voices the app is
// playing (tapped in WebAudio, before the OS render). The loopback is a LINEAR,
// delayed copy of that reference (digital loopback — no room acoustics), so a
// normalized-LMS (NLMS) adaptive FIR filter models the delay+gain and subtracts
// it, leaving only the screen content. Kept as a STRING (worklets are classic
// scripts, no bundler) — the engine wraps it in a blob URL and addModule()s it,
// exactly like the RNNoise worklet.
//
// Both legs are downmixed to mono; the output is mono (v1: shared audio is mono).
// `taps` covers the loopback delay (output buffer + capture latency, tens of ms);
// `mu` is the step size, `delta` the regularization. All tunable via a message.
export const AEC_WORKLET_SOURCE = String.raw`
class AecProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.taps = o.taps || 3072;          // FIR length in samples (~64ms @ 48k)
    this.mu = o.mu || 0.5;               // NLMS step size (0<mu<2)
    this.delta = o.delta || 1e-3;        // regularization (avoids div-by-zero on silence)
    // Leakage is applied PER SAMPLE at 48kHz, so it must be extraordinarily close to
    // 1 or it decays the weights faster than they adapt (0.9999 ≈ 0.8%/s — kills it).
    // 1 = none; the divergence guard below handles anti-drift instead.
    this.leak = o.leak != null ? o.leak : 1;
    this.w = new Float32Array(this.taps);        // adaptive filter weights
    this.xbuf = new Float32Array(this.taps);     // reference history (circular)
    this.xpos = 0;                                // write head into xbuf
    this.xnorm = this.delta;                      // running sum of xbuf^2 (for NLMS normalization)
    this.enabled = true;
    // Divergence guard: smoothed input/output power. If the filter starts ADDING
    // energy (output louder than input), it isn't cancelling a real echo — pull the
    // weights back toward zero (→ passthrough) so the AEC can never make it WORSE
    // than the raw loopback. This is what keeps a misaligned/uncorrelated reference
    // (e.g. no real echo) from injecting anti-signal.
    this.inPow = 0; this.outPow = 0;
    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (d.type === 'enabled') this.enabled = !!d.value;
      else if (d.type === 'mu' && d.value > 0) this.mu = d.value;
    };
  }

  static get parameterDescriptors() { return []; }

  // Downmix an input's channels to a single mono sample array (average).
  _mono(input, n) {
    if (!input || input.length === 0) return null;
    if (input.length === 1) return input[0];
    const out = new Float32Array(n);
    const chs = input.length;
    for (let c = 0; c < chs; c++) { const ch = input[c]; if (!ch) continue; for (let i = 0; i < n; i++) out[i] += ch[i]; }
    const g = 1 / chs;
    for (let i = 0; i < n; i++) out[i] *= g;
    return out;
  }

  process(inputs, outputs) {
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;
    const n = out.length;
    const near = this._mono(inputs[0], n);   // loopback: screen content + call echo
    const ref = this._mono(inputs[1], n);    // reference: the call mix we play

    // No loopback yet → silence out.
    if (!near) { out.fill(0); return true; }
    // No reference (not in a call / deafened) or disabled → pass the loopback through.
    if (!ref || !this.enabled) { out.set(near.subarray(0, n)); return true; }

    const w = this.w, xbuf = this.xbuf, taps = this.taps;
    // Safety floor: if the filter's output has been (on a smoothed basis) LOUDER than
    // the raw loopback, the reference isn't a real echo of the near signal (call audio
    // routed elsewhere, misalignment, a periodic tone) — the filter is only adding
    // anti-signal. In that state EMIT THE RAW LOOPBACK, never the filtered error, so
    // the AEC can never make it louder than passthrough. The weights keep adapting
    // below regardless, so as soon as a real echo appears it converges and takes over.
    const emitFiltered = this.outPow <= this.inPow + 1e-9;
    let inE = 0, outE = 0;
    for (let i = 0; i < n; i++) {
      // Push the new reference sample; keep the running L2 norm incremental.
      const oldPos = this.xpos;
      const old = xbuf[oldPos];
      const xi = ref[i];
      xbuf[oldPos] = xi;
      this.xnorm += xi * xi - old * old;
      if (this.xnorm < this.delta) this.xnorm = this.delta;
      this.xpos = oldPos + 1 === taps ? 0 : oldPos + 1;

      // y = w . x  (estimate of the echo). Walk xbuf newest→oldest against w[0..].
      let y = 0;
      let p = this.xpos - 1; if (p < 0) p += taps;
      for (let k = 0; k < taps; k++) {
        y += w[k] * xbuf[p];
        p = p === 0 ? taps - 1 : p - 1;
      }
      const d = near[i];
      const e = d - y;   // error = near - echo estimate = screen content (echo removed)
      // Measure the FILTER's cancellation (e vs d) regardless of what we emit, so the
      // safety decision reflects whether the filter WOULD help — but emit raw d when it
      // wouldn't. When helping, e is quieter than d and the echo is gone.
      out[i] = emitFiltered ? e : d;
      inE += d * d; outE += e * e;

      // NLMS weight update: w += mu * e * x / (||x||^2 + delta)
      const step = (this.mu * e) / this.xnorm;
      p = this.xpos - 1; if (p < 0) p += taps;
      const leak = this.leak;
      for (let k = 0; k < taps; k++) {
        w[k] = leak * w[k] + step * xbuf[p];
        p = p === 0 ? taps - 1 : p - 1;
      }
    }
    // Divergence guard: SLOWLY smoothed input/output power. Early in NLMS
    // convergence the output legitimately runs louder than the input (the echo
    // estimate is still poor), so the guard must tolerate that and only rein in a
    // GROSS, SUSTAINED runaway (filter blew up on an uncorrelated reference) —
    // hence slow smoothing + a 3× threshold. Too tight a guard halts convergence.
    this.inPow = 0.98 * this.inPow + 0.02 * (inE / n);
    this.outPow = 0.98 * this.outPow + 0.02 * (outE / n);
    if (this.outPow > 3 * this.inPow + 1e-9) {
      for (let k = 0; k < taps; k++) w[k] *= 0.7;
    }
    let s = this.delta; for (let k = 0; k < taps; k++) s += xbuf[k] * xbuf[k];
    this.xnorm = s; // exact recompute each block (cheap vs the O(taps) inner loops) — kills accumulation drift
    return true;
  }
}
registerProcessor('aec', AecProcessor);
`;
