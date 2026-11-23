// Procedural Web Audio API sound engine for SGX.Story Temporal Visualizer
// Zero external audio files — synthesized time-warp bursts, mechanical detents, and shutter clicks.

class TemporalAudioEngine {
  private ctx: AudioContext | null = null;
  private enabled = false;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setEnabled(next: boolean) {
    this.enabled = next;
    if (next) {
      this.ensureContext();
      this.playDetent(660);
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public playDetent(freq = 520) {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.45, now + 0.045);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  public playTimeJump(fromYear: number, toYear: number) {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const forward = toYear >= fromYear;
    const span = Math.min(1, Math.abs(toYear - fromYear) / 140);
    const dur = 0.28 + span * 0.22;

    // 1. Filtered noise whoosh (temporal air sweep)
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 3.2;
    filter.frequency.setValueAtTime(forward ? 240 : 1800, now);
    filter.frequency.exponentialRampToValueAtTime(forward ? 2400 : 220, now + dur * 0.85);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now);
    noiseGain.gain.linearRampToValueAtTime(0.11, now + dur * 0.25);
    noiseGain.gain.exponentialRampToValueAtTime(0.0008, now + dur);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + dur);

    // 2. Era-tuned harmonic lock chime
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    const baseFreq =
      toYear < 1940
        ? 196
        : toYear < 1980
        ? 293.66
        : toYear < 2020
        ? 440
        : toYear < 2050
        ? 587.33
        : 783.99;

    osc.type = toYear >= 2030 ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(forward ? baseFreq * 0.65 : baseFreq * 1.45, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq, now + dur * 0.72);

    oscGain.gain.setValueAtTime(0.001, now);
    oscGain.gain.linearRampToValueAtTime(0.065, now + dur * 0.3);
    oscGain.gain.exponentialRampToValueAtTime(0.0008, now + dur);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur);
  }

  public playShutter() {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.08);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = Math.exp(-i / (ctx.sampleRate * 0.014));
      ch[i] = (Math.random() * 2 - 1) * env;
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1100;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    src.connect(hp);
    hp.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.085);
  }

  public dispose() {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

export const temporalAudio = new TemporalAudioEngine();
