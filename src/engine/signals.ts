import { SIGNAL_IDS, type AudioMode, type SignalId } from '../state/params';

export type SignalBus = Record<SignalId, number>;

export function createSignalBus(): SignalBus {
  return Object.fromEntries(SIGNAL_IDS.map((id) => [id, 0])) as SignalBus;
}

/**
 * Audio de la mega app: micrófono real o un pulso sintético de 124 BPM
 * (heredado de Synthesize) para que todo reaccione aunque no haya sonido.
 */
export class AudioSignals {
  mode: AudioMode = 'sim';
  /** 24 barras 0..1 para el medidor del HUD */
  readonly bars = new Float32Array(24);
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private data: Uint8Array<ArrayBuffer> | null = null;
  private stream: MediaStream | null = null;
  private lastBass = 0;
  private beat = 0;

  get micStream(): MediaStream | null {
    return this.stream;
  }

  async enableMic(): Promise<boolean> {
    if (this.analyser) return true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.ctx = new AudioContext();
      const source = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.72;
      source.connect(this.analyser);
      this.data = new Uint8Array(this.analyser.frequencyBinCount);
      return true;
    } catch {
      this.disableMic();
      return false;
    }
  }

  disableMic() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.analyser = null;
    this.data = null;
    void this.ctx?.close();
    this.ctx = null;
  }

  update(bus: SignalBus, elapsed: number, delta: number) {
    let bass = 0;
    let mid = 0;
    let high = 0;
    const n = this.bars.length;

    if (this.mode === 'mic' && this.analyser && this.data) {
      this.analyser.getByteFrequencyData(this.data);
      const band = (from: number, to: number) => {
        let sum = 0;
        for (let i = from; i < to; i++) sum += this.data![i];
        return sum / ((to - from) * 255);
      };
      bass = band(0, 8);
      mid = band(8, 40);
      high = band(40, 100);
      for (let b = 0; b < n; b++) this.bars[b] = this.data[b * 3] / 255;
    } else if (this.mode === 'sim') {
      const phase = (elapsed * (124 / 60)) % 1;
      const kick = Math.pow(Math.max(0, 1 - phase * 3.4), 2.2);
      const off = Math.pow(Math.max(0, 1 - ((phase + 0.5) % 1) * 4.5), 2) * 0.45;
      bass = Math.min(1, kick * 0.92 + off * 0.35);
      mid = 0.3 + 0.25 * Math.sin(elapsed * 1.7) + off * 0.4;
      high = 0.2 + 0.2 * Math.sin(elapsed * 5.3 + 1) + off * 0.5;
      for (let b = 0; b < n; b++) {
        const fall = 1 - b / n;
        const wave = 0.5 + 0.5 * Math.sin(elapsed * 9 + b * 0.7);
        this.bars[b] = Math.min(1, bass * fall + wave * 0.25 * (1 - fall * 0.5));
      }
    } else {
      this.bars.fill(0);
    }

    // Golpe: flanco de subida de los bajos, con caída exponencial
    if (bass - this.lastBass > 0.18 && bass > 0.35) this.beat = 1;
    this.beat *= Math.exp(-delta * 6);
    this.lastBass = bass;

    bus.bass += (bass - bus.bass) * 0.35;
    bus.mid += (Math.max(0, mid) - bus.mid) * 0.3;
    bus.high += (Math.max(0, high) - bus.high) * 0.3;
    bus.beat = this.beat;
  }
}
