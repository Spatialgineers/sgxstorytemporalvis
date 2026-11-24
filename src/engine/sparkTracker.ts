import type { SignalBus } from './signals';

/** Versión del paquete @mediapipe/tasks-vision instalada; el WASM se pide de esa misma versión. */
const TASKS_VISION_VERSION = '1.2.3';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export type TrackerStatus = 'apagado' | 'cargando' | 'vivo' | 'simulado';

interface Pt {
  x: number;
  y: number;
}

interface Hands {
  left: Pt[] | null;
  right: Pt[] | null;
  mouth: number;
  face: Pt | null;
}

const BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];
const TIPS = [4, 8, 12, 16, 20];
const TIP_COLORS = ['#FFFFFF', '#00DDFF', '#FDCC0D', '#B87000', '#FFFFFF'];

function bolt(
  ctx: CanvasRenderingContext2D,
  a: Pt,
  b: Pt,
  color: string,
  jitter: number,
  segments: number,
  thickness: number
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const off = (Math.random() - 0.5) * jitter * Math.sin(t * Math.PI);
    ctx.lineTo(a.x + dx * t + nx * off, a.y + dy * t + ny * off);
  }
  ctx.lineTo(b.x, b.y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * 0.24;
  ctx.strokeStyle = color;
  ctx.lineWidth = 5.5 * thickness;
  ctx.stroke();
  ctx.globalAlpha = alpha * 0.88;
  ctx.lineWidth = 2.1 * thickness;
  ctx.stroke();
  ctx.globalAlpha = alpha * 0.96;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 0.85 * thickness;
  ctx.stroke();
  ctx.globalAlpha = alpha;
}

/** Mano sintética: 21 puntos con la misma topología que MediaPipe, para el modo simulado. */
function fakeHand(cx: number, cy: number, t: number, flip: number, pinch: number): Pt[] {
  const pts: Pt[] = [{ x: cx, y: cy + 0.09 }];
  for (let f = 0; f < 5; f++) {
    const spread = (f - 2) * 0.32 * flip;
    const curl = f === 1 ? pinch : 0;
    for (let j = 1; j <= 4; j++) {
      const reach = 0.035 + j * (f === 0 ? 0.022 : 0.03) * (1 - curl * 0.45);
      const ang = -Math.PI / 2 + spread + Math.sin(t * 2 + f) * 0.06 + (f === 0 ? flip * -0.5 * (1 - pinch) : 0);
      pts.push({ x: cx + Math.cos(ang) * reach * 0.62, y: cy + 0.09 + Math.sin(ang) * reach });
    }
  }
  if (pinch > 0.5) pts[8] = { x: pts[4].x + 0.008, y: pts[4].y + 0.005 };
  return pts;
}

/**
 * SGX.Spark: seguimiento de manos y rostro, HUD de arcos y la "carga" que sube con el juego.
 * Publica todo en el bus de señales para que los demás motores reaccionen.
 */
export class SparkTracker {
  status: TrackerStatus = 'apagado';
  /** Se llama cuando la carga llega a 100%: el motor responde con un golpe global. */
  onOverload: (() => void) | null = null;

  private handLm: { detectForVideo: (v: HTMLVideoElement, ts: number) => { landmarks: Pt[][] } } | null = null;
  private faceLm: { detectForVideo: (v: HTMLVideoElement, ts: number) => { faceLandmarks: Pt[][] } } | null = null;
  private loading = false;
  private failed = false;
  private lastDetect = 0;
  private flipFace = false;
  private hands: Hands = { left: null, right: null, mouth: 0, face: null };
  private energy = 0;
  private overdriveUntil = 0;

  private async load() {
    if (this.loading || this.handLm || this.failed) return;
    this.loading = true;
    this.status = 'cargando';
    try {
      const vision = await import('@mediapipe/tasks-vision');
      const files = await vision.FilesetResolver.forVisionTasks(WASM_URL);
      this.handLm = await vision.HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 2,
      });
      this.faceLm = await vision.FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
      });
    } catch (err) {
      console.warn('SGX.Spark: no se pudo cargar el seguimiento, sigue en modo simulado.', err);
      this.failed = true;
    } finally {
      this.loading = false;
    }
  }

  /**
   * @param video cámara en vivo, o null si la fuente no es cámara (entonces simula)
   * @param mirrored si la imagen se dibuja espejada
   */
  update(bus: SignalBus, video: HTMLVideoElement | null, mirrored: boolean, elapsed: number, delta: number, charge: number) {
    const live = video && video.readyState >= 2 && video.videoWidth > 0;
    if (live && !this.handLm && !this.failed) void this.load();

    if (live && this.handLm) {
      this.status = 'vivo';
      const now = performance.now();
      if (now - this.lastDetect > 33) {
        this.lastDetect = now;
        try {
          // Manos y rostro se alternan para repartir el costo entre cuadros
          if (this.flipFace && this.faceLm) {
            const face = this.faceLm.detectForVideo(video, now).faceLandmarks[0];
            if (face) {
              const h = Math.hypot(face[10].x - face[152].x, face[10].y - face[152].y) || 1;
              this.hands.mouth = Math.min(1, Math.max(0, (Math.hypot(face[13].x - face[14].x, face[13].y - face[14].y) / h - 0.02) * 6));
              this.hands.face = this.map(face[1], mirrored);
            } else {
              this.hands.face = null;
              this.hands.mouth = 0;
            }
          } else {
            const res = this.handLm.detectForVideo(video, now).landmarks.map((lm) => lm.map((p) => this.map(p, mirrored)));
            res.sort((a, b) => a[0].x - b[0].x);
            this.hands.left = res[0] ?? null;
            this.hands.right = res[1] ?? null;
          }
          this.flipFace = !this.flipFace;
        } catch {
          /* un cuadro perdido no detiene el seguimiento */
        }
      }
    } else {
      this.status = this.loading ? 'cargando' : 'simulado';
      const pinch = Math.sin(elapsed * 0.9) > 0.72 ? 1 : 0;
      const open = 0.2 + 0.16 * Math.sin(elapsed * 0.45);
      const cy = 0.52 + 0.1 * Math.sin(elapsed * 0.8);
      this.hands.left = fakeHand(0.5 - open, cy + 0.05 * Math.cos(elapsed * 1.3), elapsed, 1, pinch);
      this.hands.right = fakeHand(0.5 + open, cy - 0.05 * Math.cos(elapsed * 1.1), elapsed + 2, -1, 0);
      this.hands.mouth = Math.max(0, Math.sin(elapsed * 0.6)) * 0.6;
      this.hands.face = { x: 0.5 + 0.03 * Math.sin(elapsed * 0.5), y: 0.3 };
    }

    // --- Señales ---
    const { left, right } = this.hands;
    const main = right ?? left;
    const ease = (key: keyof SignalBus, target: number, k = 0.25) => {
      bus[key] += (target - bus[key]) * k;
    };
    ease('handX', main ? main[9].x : 0.5, 0.2);
    ease('handY', main ? 1 - main[9].y : 0.5, 0.2);
    const span = left && right ? Math.min(1, Math.hypot(right[9].x - left[9].x, right[9].y - left[9].y) * 1.6) : 0;
    ease('span', span);
    const pinching = [left, right].some((h) => h && Math.hypot(h[4].x - h[8].x, h[4].y - h[8].y) < 0.055);
    ease('pinch', pinching ? 1 : 0, 0.4);
    ease('mouth', this.hands.mouth);

    // --- Carga Spark: sube con pinzas y arcos, baja sola; al 100% dispara la sobrecarga ---
    const now = performance.now();
    if (now > this.overdriveUntil) {
      const gain = (pinching ? 0.22 : 0) + (span > 0.25 ? 0.12 : 0) + bus.mouth * 0.08;
      this.energy = Math.min(1, Math.max(0, this.energy + (gain * (0.4 + charge * 1.6) - 0.03) * delta));
      if (this.energy >= 1) {
        this.overdriveUntil = now + 4000;
        this.onOverload?.();
      }
    } else {
      this.energy = Math.max(0, (this.overdriveUntil - now) / 4000);
    }
    bus.energy = this.energy;
  }

  private map(p: Pt, mirrored: boolean): Pt {
    return { x: mirrored ? 1 - p.x : p.x, y: p.y };
  }

  get overdrive(): boolean {
    return performance.now() < this.overdriveUntil;
  }

  /** Dibuja el HUD de Spark sobre el lienzo dado (coordenadas normalizadas a w×h). */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, elapsed: number, gain: number, arc: number) {
    const { left, right, face } = this.hands;
    const px = (p: Pt): Pt => ({ x: p.x * w, y: p.y * h });
    const unit = h / 720;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = gain;

    for (const [hand, color] of [[left, '#00DDFF'], [right, '#FDCC0D']] as const) {
      if (!hand) continue;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 * unit;
      ctx.beginPath();
      for (const [a, b] of BONES) {
        ctx.moveTo(hand[a].x * w, hand[a].y * h);
        ctx.lineTo(hand[b].x * w, hand[b].y * h);
      }
      ctx.stroke();
      TIPS.forEach((tip, i) => {
        const p = px(hand[tip]);
        const r = (7 + 2 * Math.sin(elapsed * 6 + i)) * unit;
        ctx.strokeStyle = TIP_COLORS[i];
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - r);
        ctx.lineTo(p.x + r, p.y);
        ctx.lineTo(p.x, p.y + r);
        ctx.lineTo(p.x - r, p.y);
        ctx.closePath();
        ctx.stroke();
      });
      // Pinza: chispa entre pulgar e índice
      if (Math.hypot(hand[4].x - hand[8].x, hand[4].y - hand[8].y) < 0.055) {
        const p = px(hand[8]);
        for (let k = 0; k < 5; k++) {
          const ang = Math.random() * Math.PI * 2;
          const reach = (30 + Math.random() * 50) * unit;
          bolt(ctx, p, { x: p.x + Math.cos(ang) * reach, y: p.y + Math.sin(ang) * reach }, color, 14 * unit, 5, unit);
        }
      }
    }

    // Arco dual: rayos de dedo a dedo y un conducto de palma a palma
    if (left && right && arc > 0.01) {
      const spanPx = Math.hypot((right[9].x - left[9].x) * w, (right[9].y - left[9].y) * h);
      const jitter = Math.min(68, Math.max(18, spanPx * 0.14)) * unit;
      const boost = this.overdrive ? 1.6 : 1;
      ctx.globalAlpha = gain * arc;
      TIPS.forEach((tip, i) => {
        bolt(ctx, px(left[tip]), px(right[tip]), i % 2 === 0 ? '#00DDFF' : '#FDCC0D', jitter, 10, 1.6 * unit * boost);
      });
      bolt(ctx, px(left[9]), px(right[9]), '#FDCC0D', jitter * 1.15, 12, 2.2 * unit * boost);
      const mx = ((left[9].x + right[9].x) / 2) * w;
      const my = ((left[9].y + right[9].y) / 2) * h;
      const r = (14 + Math.sin(elapsed * 18) * 4) * 2.4 * unit * boost;
      const g = ctx.createRadialGradient(mx, my, 2, mx, my, r);
      g.addColorStop(0, '#FFFFFF');
      g.addColorStop(0.38, 'rgba(0,221,255,0.78)');
      g.addColorStop(0.75, 'rgba(253,204,13,0.25)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = gain;
    }

    // Retícula de rostro
    if (face) {
      const p = px(face);
      const r = 46 * unit;
      ctx.strokeStyle = '#00DDFF';
      ctx.lineWidth = 1.5 * unit;
      for (let k = 0; k < 4; k++) {
        const a0 = elapsed * 0.8 + (k * Math.PI) / 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, a0, a0 + 0.9);
        ctx.stroke();
      }
    }

    // Sobrecarga: anillo octagonal que se expande
    if (this.overdrive) {
      const k = 1 - (this.overdriveUntil - performance.now()) / 4000;
      const r = k * Math.max(w, h) * 0.7;
      ctx.globalAlpha = gain * (1 - k);
      ctx.strokeStyle = '#00DDFF';
      ctx.lineWidth = 6 * unit;
      ctx.beginPath();
      for (let s = 0; s <= 8; s++) {
        const ang = (s / 8) * Math.PI * 2 + elapsed;
        const x = w / 2 + Math.cos(ang) * r;
        const y = h / 2 + Math.sin(ang) * r;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}
