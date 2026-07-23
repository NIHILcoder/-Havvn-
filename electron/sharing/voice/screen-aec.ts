// Screen-share audio echo canceller (M20). Wraps the AEC AudioWorklet in a small
// WebAudio graph that runs in the engine window:
//
//   screen loopback ─────────────────────────────► [aec in0]
//   peer A voice ─► gain(effVolA) ─┐
//   peer B voice ─► gain(effVolB) ─┼──────────────► [aec in1]  (summed reference)
//   ...                            ┘
//                                        [aec] ─► dest ─► cleaned screen-audio track
//
// The reference is the exact mix of remote voices the app is playing (each remote
// stream tapped separately and summed at its effective volume), so the worklet can
// subtract the call echo the desktop loopback re-captured. Deafen/mute the whole
// reference when the user hears nothing (loopback then has no echo — cancelling a
// non-existent echo would only add noise). The output track carries screen content
// only and is what gets sent to peers.
import { AEC_WORKLET_SOURCE } from './aec-worklet';

interface RefPeer { src: MediaStreamAudioSourceNode; gain: GainNode; }

export class ScreenAec {
  private ctx: AudioContext;
  private node: AudioWorkletNode | null = null;
  private dest: MediaStreamAudioDestinationNode;
  private screenSrc: MediaStreamAudioSourceNode | null = null;
  private inAnalyser: AnalyserNode | null = null;   // RMS of the raw loopback (screen + echo)
  private outAnalyser: AnalyserNode | null = null;  // RMS of the cleaned output (echo removed)
  private refs = new Map<string, RefPeer>();
  private muted = false;           // reference silenced (deafened / nobody to hear)
  private closed = false;
  private log: (m: string) => void;

  private constructor(ctx: AudioContext, dest: MediaStreamAudioDestinationNode, log: (m: string) => void) {
    this.ctx = ctx; this.dest = dest; this.log = log;
  }

  /** Build the canceller for one screen-audio track. Resolves to null if the
   *  worklet can't load (caller then sends the raw loopback, or no audio). */
  static async create(screenStream: MediaStream, taps: number, log: (m: string) => void): Promise<ScreenAec | null> {
    const track = screenStream.getAudioTracks()[0];
    if (!track) return null;
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext();
      const url = URL.createObjectURL(new Blob([AEC_WORKLET_SOURCE], { type: 'application/javascript' }));
      try { await ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
      const dest = ctx.createMediaStreamDestination();
      const self = new ScreenAec(ctx, dest, log);
      const node = new AudioWorkletNode(ctx, 'aec', {
        numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [1],
        channelCount: 1, channelCountMode: 'explicit', channelInterpretation: 'speakers',
        processorOptions: { taps },
      });
      self.node = node;
      // in0 = the raw loopback (screen content + call echo).
      self.screenSrc = ctx.createMediaStreamSource(new MediaStream([track]));
      self.screenSrc.connect(node, 0, 0);
      node.connect(dest);
      // ERLE probes (observe-only, not connected to the output): raw loopback vs
      // cleaned output RMS — lets a test read how much echo the filter removes.
      self.inAnalyser = ctx.createAnalyser(); self.inAnalyser.fftSize = 2048;
      self.outAnalyser = ctx.createAnalyser(); self.outAnalyser.fftSize = 2048;
      self.screenSrc.connect(self.inAnalyser);
      node.connect(self.outAnalyser);
      await ctx.resume().catch(() => { /* engine window is permissive */ });
      return self;
    } catch (e) {
      log('screen AEC init failed: ' + String(e));
      try { await ctx?.close(); } catch { /* ignore */ }
      return null;
    }
  }

  /** The cleaned (echo-cancelled) screen-audio track to send to peers. */
  get outputTrack(): MediaStreamTrack | null { return this.dest.stream.getAudioTracks()[0] || null; }

  /** Instantaneous RMS of the raw loopback vs the cleaned output, and the active
   *  reference count — a test reads this to gauge echo cancellation (out << in when
   *  the filter is cancelling a real echo). Exposed for verification only. */
  stats(): { inRms: number; outRms: number; refs: number; muted: boolean } {
    const rms = (a: AnalyserNode | null): number => {
      if (!a) return 0;
      const buf = new Float32Array(a.fftSize);
      a.getFloatTimeDomainData(buf);
      let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      return Math.sqrt(s / buf.length);
    };
    return { inRms: rms(this.inAnalyser), outRms: rms(this.outAnalyser), refs: this.refs.size, muted: this.muted };
  }

  /** Add / update a remote voice in the reference at its effective play volume. */
  setReference(memberId: string, stream: MediaStream, gain: number): void {
    if (this.closed || !this.node) return;
    let ref = this.refs.get(memberId);
    if (!ref) {
      try {
        const src = this.ctx.createMediaStreamSource(stream);
        const g = this.ctx.createGain();
        src.connect(g);
        g.connect(this.node, 0, 1); // sums into the AEC's reference input
        ref = { src, gain: g };
        this.refs.set(memberId, ref);
      } catch (e) { this.log('aec ref add failed: ' + String(e)); return; }
    }
    ref.gain.gain.value = this.muted ? 0 : Math.max(0, gain);
  }

  /** Drop a member from the reference (they left / stopped being heard). */
  removeReference(memberId: string): void {
    const ref = this.refs.get(memberId);
    if (!ref) return;
    try { ref.src.disconnect(); } catch { /* ignore */ }
    try { ref.gain.disconnect(); } catch { /* ignore */ }
    this.refs.delete(memberId);
  }

  /** Silence (or restore) the whole reference — deafen means nothing is played, so
   *  the loopback carries no echo and the filter must have a zero reference. */
  setMuted(muted: boolean, gains: Map<string, number>): void {
    this.muted = muted;
    for (const [id, ref] of this.refs) ref.gain.gain.value = muted ? 0 : Math.max(0, gains.get(id) ?? 1);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const id of Array.from(this.refs.keys())) this.removeReference(id);
    try { this.screenSrc?.disconnect(); } catch { /* ignore */ }
    try { this.node?.disconnect(); } catch { /* ignore */ }
    try { void this.ctx.close(); } catch { /* ignore */ }
  }
}
