import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { DECADES, getDecadeIndexByYear, type SplitLayout } from '../data/decades';
import { STUDIO_PLATES } from '../data/plates';
import { MASKS, resolveParam, type FusionState } from '../state/params';
import { GLITCH_FRAGMENT_SHADER } from './glitchShader';
import {
  COPY_SHADER,
  NEXUS_COMPOSITE_SHADER,
  NEXUS_FRAGMENT_SHADER,
  NEXUS_VERTEX_SHADER,
} from './nexusShader';
import { AudioSignals, createSignalBus, type SignalBus } from './signals';
import { SparkTracker } from './sparkTracker';
import { SYNTH_FRAGMENT_SHADER } from './synthShader';
import { TEMPORAL_FRAGMENT_SHADER, TEMPORAL_VERTEX_SHADER } from './temporalShader';

const SPLIT_MODE: Record<SplitLayout, number> = {
  single: 0, ab: 1, dual: 2, trio: 3, quad: 4, dualH: 5, hex: 6, grid9: 7, mask: 8,
};

export interface Telemetry {
  fps: number;
  width: number;
  height: number;
  tracker: string;
  sourceLive: boolean;
}

export interface EngineCallbacks {
  /** La fuente pedida falló y el motor volvió a la señal sintética. */
  onSourceError: (message: string) => void;
  onOverload: () => void;
}

function createAsciiAtlas(): THREE.CanvasTexture {
  const chars = ' .,:;i1tfLCG08@#';
  const cell = 64;
  const canvas = document.createElement('canvas');
  canvas.width = cell * chars.length;
  canvas.height = cell;
  const ctx = canvas.getContext('2d')!;
  const draw = () => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = '700 50px "Share Tech Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < chars.length; i++) ctx.fillText(chars[i], i * cell + cell * 0.5, cell * 0.54);
  };
  draw();
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  void document.fonts?.ready.then(() => {
    draw();
    tex.needsUpdate = true;
  });
  return tex;
}

/**
 * Un solo renderer para los cinco motores. La señal recorre la cadena
 * FUENTE → STORY → SPARK → SYNTH → NEXUS → GLITCH → SALIDA, y cada motor
 * apagado simplemente se salta. Todo se lee del estado en cada cuadro.
 */
export class FusionEngine {
  readonly signals: SignalBus = createSignalBus();
  readonly audio = new AudioSignals();
  readonly telemetry: Telemetry = { fps: 0, width: 0, height: 0, tracker: 'apagado', sourceLive: false };

  private renderer: THREE.WebGLRenderer;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];

  private texCanvas = document.createElement('canvas');
  private texCtx: CanvasRenderingContext2D;
  private sourceTex: THREE.CanvasTexture;
  private hudCanvas = document.createElement('canvas');
  private hudCtx: CanvasRenderingContext2D;
  private hudTex: THREE.CanvasTexture;
  private hudMat: THREE.MeshBasicMaterial;

  private storyMat: THREE.ShaderMaterial;
  private synthMat: THREE.ShaderMaterial;
  private glitchMat: THREE.ShaderMaterial;
  private copyMat: THREE.ShaderMaterial;
  private nexusCompositeMat: THREE.ShaderMaterial;

  private nexusScene = new THREE.Scene();
  private nexusCam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  private nexusMat: THREE.ShaderMaterial;
  private nexusPoints: THREE.Points | null = null;
  private nexusDensity = 0;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private yaw = 0;
  private pitch = 0;

  private maskTex: THREE.Texture;
  private maskAspect = 1;
  private maskId = '';

  private tracker = new SparkTracker();
  private video: HTMLVideoElement | null = null;
  private image: HTMLImageElement | null = null;
  private stream: MediaStream | null = null;
  private sourceKey = '';
  private sourceSession = 0;
  private file: { url: string; kind: 'image' | 'video'; nonce: number } | null = null;

  private clock = new THREE.Clock();
  private glitchTime = 0;
  private punchLevel = 0;
  private warpLevel = 0;
  private rippleStart = -99;
  private raf = 0;
  private frames = 0;
  private fpsStamp = performance.now();
  private resizeObserver: ResizeObserver;
  private recorder: MediaRecorder | null = null;
  private drag: { x: number; y: number } | null = null;
  private disposed = false;

  constructor(
    private mount: HTMLElement,
    private getState: () => FusionState,
    private callbacks: EngineCallbacks
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    // Los shaders escriben color final; el renderer no debe convertir nada.
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.autoClear = false;
    const el = this.renderer.domElement;
    el.style.cssText = 'width:100%;height:100%;display:block;touch-action:none';
    mount.appendChild(el);

    this.texCtx = this.texCanvas.getContext('2d')!;
    this.hudCtx = this.hudCanvas.getContext('2d')!;
    this.sourceTex = this.canvasTexture(this.texCanvas);
    this.hudTex = this.canvasTexture(this.hudCanvas);

    const targetOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    this.targets = [new THREE.WebGLRenderTarget(2, 2, targetOpts), new THREE.WebGLRenderTarget(2, 2, targetOpts)];

    const empty = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    empty.needsUpdate = true;
    this.maskTex = empty;

    const pass = (fragmentShader: string, uniforms: Record<string, { value: unknown }>) =>
      new THREE.ShaderMaterial({
        vertexShader: TEMPORAL_VERTEX_SHADER,
        fragmentShader,
        uniforms: { tDiffuse: { value: null }, ...uniforms },
        depthTest: false,
        depthWrite: false,
      });
    const v2 = (x = 0, y = 0) => ({ value: new THREE.Vector2(x, y) });
    const col = (hex = '#ffffff') => ({ value: new THREE.Color(hex) });
    const f = (value = 0) => ({ value });

    this.storyMat = pass(TEMPORAL_FRAGMENT_SHADER, {
      tMask: { value: empty }, u_time: f(), u_decade: f(1980), u_variant: f(), u_intensity: f(1), u_scale: f(1),
      u_grain: f(0.35), u_resolution: v2(1, 1), u_mediaAspect: f(16 / 9), u_flip: f(), u_tintColor: col(),
      u_tintPower: f(), u_splitEnabled: f(), u_splitMode: f(), u_splitX: f(0.5), u_splitY: f(0.5),
      u_zoneDecades: { value: new Array(9).fill(1980) }, u_zoneVariants: { value: new Array(9).fill(0) },
      u_activeZone: f(-1), u_maskAspect: f(1), u_maskScale: f(0.85), u_maskOffset: v2(), u_maskInvert: f(),
      u_maskFeather: f(0.02), u_maskEdge: f(1), u_maskEdgeColor: col(), u_lite: f(), u_warp: f(), u_warpDir: f(1),
      u_frameRatio: f(),
    });

    this.synthMat = pass(SYNTH_FRAGMENT_SHADER, {
      tAscii: { value: createAsciiAtlas() }, tMask: { value: empty }, u_resolution: v2(1, 1), u_mode: f(),
      u_modeB: f(-1), u_maskActive: f(), u_maskAspect: f(1), u_maskScale: f(0.86), u_maskOpacity: f(0.9),
      u_maskInvert: f(), u_maskPulse: f(1), u_intensity: f(0.6), u_scale: f(1), u_bloom: f(0.3), u_color: col(),
      u_colorB: col(), u_time: f(), u_audio: f(), u_splitscreen: f(), u_lite: f(), u_mirror: f(), u_invert: f(),
      u_punch: f(), u_pointer: v2(0.5, 0.5), u_rippleAge: f(99),
    });

    this.glitchMat = pass(GLITCH_FRAGMENT_SHADER, {
      u_time: f(), u_block: f(), u_tear: f(), u_wave: f(), u_pixel: f(), u_rgb: v2(), u_bleed: f(), u_crt: f(),
      u_noise: f(), u_jitter: f(), u_bright: f(1), u_cont: f(1), u_sat: f(1), u_hue: f(), u_invert: f(),
    });
    this.copyMat = pass(COPY_SHADER, {});
    this.nexusCompositeMat = pass(NEXUS_COMPOSITE_SHADER, { tNexus: { value: null }, u_backdrop: f(0.25) });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.copyMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    this.hudMat = new THREE.MeshBasicMaterial({
      map: this.hudTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });

    this.nexusMat = new THREE.ShaderMaterial({
      vertexShader: NEXUS_VERTEX_SHADER,
      fragmentShader: NEXUS_FRAGMENT_SHADER,
      uniforms: {
        tDiffuse: { value: null }, u_aspect: f(1), u_pointSize: f(7), u_zExtrusion: f(2), u_morph: f(), u_bass: f(),
        u_time: f(), u_turbulence: f(1), u_shape: f(), u_colorMode: f(), u_colorNear: col(), u_colorDeep: col(),
        u_chroma: f(),
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.composer = new EffectComposer(this.renderer);
    this.composer.renderToScreen = false;
    const nexusPass = new RenderPass(this.nexusScene, this.nexusCam);
    nexusPass.clearColor = new THREE.Color(0x000000);
    nexusPass.clearAlpha = 1;
    this.composer.addPass(nexusPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.8, 0.4, 0.2);
    this.composer.addPass(this.bloom);

    this.tracker.onOverload = () => {
      this.punch();
      this.callbacks.onOverload();
    };

    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(mount);
    this.resize();
    this.frame();
  }

  private canvasTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.NoColorSpace;
    return tex;
  }

  /* ----------------------------- interacción ----------------------------- */

  private onPointerDown = (e: PointerEvent) => {
    this.drag = { x: e.clientX, y: e.clientY };
    this.rippleStart = this.clock.elapsedTime;
    this.onPointerMove(e);
  };

  private onPointerMove = (e: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.signals.pointerX = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    this.signals.pointerY = Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height));
    if (this.drag && this.getState().on.nexus) {
      this.yaw += (e.clientX - this.drag.x) * 0.006;
      this.pitch = Math.min(1.2, Math.max(-1.2, this.pitch + (e.clientY - this.drag.y) * 0.004));
      this.drag = { x: e.clientX, y: e.clientY };
    }
  };

  private onPointerUp = () => {
    this.drag = null;
  };

  /** Golpe global: sacude Synth, dispara el salto temporal de Story y rompe Glitch por un instante. */
  punch() {
    this.punchLevel = 1;
    this.warpLevel = 1;
  }

  /* ------------------------------- fuentes ------------------------------- */

  setFile(file: File) {
    if (this.file) URL.revokeObjectURL(this.file.url);
    this.file = {
      url: URL.createObjectURL(file),
      kind: file.type.startsWith('video/') ? 'video' : 'image',
      nonce: (this.file?.nonce ?? 0) + 1,
    };
  }

  private releaseSource() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      this.video.removeAttribute('src');
      this.video = null;
    }
    this.image = null;
  }

  private async switchSource(state: FusionState) {
    const session = ++this.sourceSession;
    this.releaseSource();
    const fail = (message: string) => {
      if (session === this.sourceSession) this.callbacks.onSourceError(message);
    };
    const makeVideo = () => {
      const v = document.createElement('video');
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      return v;
    };
    const loadImage = (src: string) => {
      const img = new Image();
      img.onload = () => {
        if (session === this.sourceSession) this.image = img;
      };
      img.onerror = () => fail('No se pudo cargar la imagen.');
      img.src = src;
    };

    if (state.source === 'camera') {
      if (!navigator.mediaDevices?.getUserMedia) return fail('Este navegador no da acceso a la cámara.');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (session !== this.sourceSession) return stream.getTracks().forEach((t) => t.stop());
        const v = makeVideo();
        v.srcObject = stream;
        await v.play();
        this.stream = stream;
        this.video = v;
      } catch {
        fail('No hay cámara disponible o el permiso fue negado.');
      }
    } else if (state.source === 'plate') {
      loadImage((STUDIO_PLATES.find((p) => p.id === state.plateId) ?? STUDIO_PLATES[0]).src);
    } else if (state.source === 'file' && this.file) {
      if (this.file.kind === 'video') {
        const v = makeVideo();
        v.src = this.file.url;
        v.play().then(
          () => {
            if (session === this.sourceSession) this.video = v;
          },
          () => fail('No se pudo reproducir el video.')
        );
      } else {
        loadImage(this.file.url);
      }
    }
  }

  private drawSource(state: FusionState, t: number) {
    const ctx = this.texCtx;
    const w = this.texCanvas.width;
    const h = this.texCanvas.height;
    const media = this.video && this.video.readyState >= 2 ? this.video : this.image;
    this.telemetry.sourceLive = !!media;

    if (media) {
      const mw = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
      const mh = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
      const scale = Math.max(w / mw, h / mh);
      const dw = mw * scale;
      const dh = mh * scale;
      ctx.save();
      if (state.mirror && state.source === 'camera') {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(media, (w - dw) / 2, (h - dh) / 2, dw, dh);
      ctx.restore();
      return;
    }

    // Señal sintética de Synthesize: anillos hexagonales y barras que laten con el audio
    const level = this.signals.bass;
    const cx = w / 2;
    const cy = h / 2;
    const unit = h / 720;
    const grad = ctx.createRadialGradient(
      cx + Math.sin(t * 0.8) * 160 * unit, cy + Math.cos(t * 0.6) * 110 * unit, 30 * unit, cx, cy, w * 0.62
    );
    grad.addColorStop(0, state.colorA);
    grad.addColorStop(0.38, '#32527B');
    grad.addColorStop(0.75, '#111621');
    grad.addColorStop(1, '#050505');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(unit, unit);
    for (let k = 0; k < 6; k++) {
      const phase = (t * 0.45 + k / 6) % 1;
      const rad = 50 + phase * 560 * (1 + level * 0.35);
      ctx.strokeStyle = k % 2 === 0 ? state.colorB : state.colorA;
      ctx.globalAlpha = Math.max(0.08, 1 - phase);
      ctx.lineWidth = 3 + level * 6;
      ctx.beginPath();
      const rot = t * (k % 2 === 0 ? 0.5 : -0.4);
      for (let s = 0; s <= 6; s++) {
        const ang = rot + (s / 6) * Math.PI * 2;
        if (s === 0) ctx.moveTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
        else ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = state.colorA;
    for (let b = -14; b <= 14; b++) {
      const bh = 30 + Math.abs(Math.sin(t * 4.2 + b * 0.45)) * (130 + level * 180);
      ctx.fillRect(b * 32 - 8, -bh * 0.5, 16, bh);
    }
    ctx.restore();
  }

  /* -------------------------------- máscara ------------------------------- */

  private loadMask(id: string) {
    this.maskId = id;
    const src = MASKS.find((m) => m.id === id)?.src;
    if (!src) return;
    new THREE.TextureLoader().load(src, (tex) => {
      if (this.maskId !== id || this.disposed) return tex.dispose();
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.NoColorSpace;
      this.maskTex = tex;
      const img = tex.image as HTMLImageElement;
      this.maskAspect = img.width / img.height;
    });
  }

  /* -------------------------------- tamaño ------------------------------- */

  private resize() {
    const state = this.getState();
    const cssW = Math.max(2, this.mount.clientWidth);
    const cssH = Math.max(2, this.mount.clientHeight);
    this.renderer.setPixelRatio(state.lite ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(cssW, cssH, false);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.targets.forEach((t) => t.setSize(size.x, size.y));
    this.composer.setSize(size.x, size.y);
    this.nexusCam.aspect = size.x / size.y;
    this.nexusCam.updateProjectionMatrix();

    const workH = Math.min(state.lite ? 480 : 720, size.y);
    const workW = Math.round((workH * size.x) / size.y);
    for (const c of [this.texCanvas, this.hudCanvas]) {
      c.width = workW;
      c.height = workH;
    }
    // Un lienzo que cambia de tamaño necesita una textura nueva
    this.sourceTex.dispose();
    this.hudTex.dispose();
    this.telemetry.width = size.x;
    this.telemetry.height = size.y;
    this.lite = state.lite;
  }

  private lite = false;

  private buildNexus(density: number) {
    if (this.nexusPoints) {
      this.nexusScene.remove(this.nexusPoints);
      this.nexusPoints.geometry.dispose();
    }
    const count = density;
    const positions = new Float32Array(count * count * 3);
    const uvs = new Float32Array(count * count * 2);
    let i = 0;
    let u = 0;
    for (let x = 0; x < count; x++) {
      for (let y = 0; y < count; y++) {
        positions[i++] = (x / count) * 2 - 1;
        positions[i++] = (y / count) * 2 - 1;
        positions[i++] = 0;
        uvs[u++] = x / count;
        uvs[u++] = y / count;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.nexusPoints = new THREE.Points(geometry, this.nexusMat);
    this.nexusPoints.frustumCulled = false;
    this.nexusScene.add(this.nexusPoints);
    this.nexusDensity = density;
  }

  /* -------------------------------- cuadro ------------------------------- */

  private frame = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const state = this.getState();
    const delta = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;
    const sig = this.signals;
    const val = (id: string) => resolveParam(state, sig, id);

    if (state.lite !== this.lite) this.resize();
    const key = `${state.source}|${state.plateId}|${this.file?.nonce ?? 0}`;
    if (key !== this.sourceKey) {
      this.sourceKey = key;
      void this.switchSource(state);
    }
    if (state.maskId !== this.maskId) this.loadMask(state.maskId);

    // 1. Señales
    this.audio.mode = state.audio;
    this.audio.update(sig, t, delta);
    sig.lfo = 0.5 + 0.5 * Math.sin(t * 0.7);
    if (state.on.spark) {
      const cam = state.source === 'camera' ? this.video : null;
      this.tracker.update(sig, cam, state.mirror, t, delta, state.p['spark.charge']);
      this.telemetry.tracker = this.tracker.status;
    } else {
      for (const id of ['handX', 'handY', 'span', 'pinch', 'mouth', 'energy'] as const) sig[id] *= 0.9;
      this.telemetry.tracker = 'apagado';
    }
    this.punchLevel *= Math.exp(-delta * 3.2);
    this.warpLevel *= Math.exp(-delta * 2.4);

    // 2. Fuente (y Spark dentro de la señal, si así está puesto)
    this.drawSource(state, t);
    const w = this.texCanvas.width;
    const h = this.texCanvas.height;
    const sparkGain = val('spark.gain');
    const sparkArc = val('spark.arc');
    if (state.on.spark && state.sparkInSignal) this.tracker.draw(this.texCtx, w, h, t, sparkGain, sparkArc);
    this.sourceTex.needsUpdate = true;

    // 3. Cadena de motores
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const stages: THREE.ShaderMaterial[] = [];
    let nexusIndex = -1;

    if (state.on.story) {
      const u = this.storyMat.uniforms;
      const idx = getDecadeIndexByYear(state.storyYear);
      u.u_time.value = t;
      u.u_decade.value = state.storyYear;
      u.u_variant.value = state.storyVariant;
      u.u_intensity.value = val('story.intensity');
      u.u_scale.value = val('story.scale');
      u.u_grain.value = val('story.grain');
      u.u_resolution.value.copy(size);
      u.u_mediaAspect.value = size.x / size.y;
      u.u_tintColor.value.set(state.colorA);
      u.u_tintPower.value = val('story.tint');
      u.u_splitEnabled.value = state.storyLayout === 'ab' ? 1 : 0;
      u.u_splitMode.value = SPLIT_MODE[state.storyLayout];
      // Las zonas extra recorren la línea de tiempo desde la era elegida
      for (let z = 0; z < 9; z++) {
        u.u_zoneDecades.value[z] = DECADES[(idx + z * 3) % DECADES.length].year;
        u.u_zoneVariants.value[z] = (state.storyVariant + z) % 3;
      }
      u.tMask.value = this.maskTex;
      u.u_maskAspect.value = this.maskAspect;
      u.u_maskScale.value = val('story.maskScale');
      u.u_maskEdgeColor.value.set(state.colorA);
      u.u_lite.value = state.lite ? 1 : 0;
      u.u_warp.value = this.warpLevel;
      stages.push(this.storyMat);
    }

    if (state.on.synth) {
      const u = this.synthMat.uniforms;
      u.u_resolution.value.copy(size);
      u.u_mode.value = state.synthMode;
      u.u_modeB.value = state.synthModeB;
      u.u_maskActive.value = state.synthModeB >= 0 ? 1 : 0;
      u.tMask.value = this.maskTex;
      u.u_maskAspect.value = this.maskAspect;
      u.u_maskScale.value = val('synth.maskScale');
      u.u_maskOpacity.value = val('synth.maskOpacity');
      u.u_intensity.value = val('synth.intensity');
      u.u_scale.value = val('synth.scale');
      u.u_bloom.value = val('synth.bloom');
      u.u_color.value.set(state.colorA);
      u.u_colorB.value.set(state.colorB);
      u.u_time.value = t;
      u.u_audio.value = sig.bass * val('synth.audio');
      u.u_mirror.value = state.synthMirror;
      u.u_invert.value = val('synth.invert');
      u.u_punch.value = this.punchLevel;
      u.u_pointer.value.set(sig.pointerX, sig.pointerY);
      u.u_rippleAge.value = t - this.rippleStart;
      stages.push(this.synthMat);
    }

    if (state.on.nexus) {
      nexusIndex = stages.length;
      stages.push(this.nexusCompositeMat);
    }

    if (state.on.glitch) {
      const u = this.glitchMat.uniforms;
      const hit = this.punchLevel;
      this.glitchTime += delta * val('glitch.speed');
      u.u_time.value = this.glitchTime;
      u.u_block.value = Math.min(1, val('glitch.block') + hit * 0.5);
      u.u_tear.value = Math.min(1, val('glitch.tear') + hit * 0.6);
      u.u_wave.value = val('glitch.wave');
      u.u_pixel.value = val('glitch.pixel');
      u.u_rgb.value.set(val('glitch.rgbX') + hit * 0.25, val('glitch.rgbY'));
      u.u_bleed.value = val('glitch.bleed');
      u.u_crt.value = val('glitch.crt');
      u.u_noise.value = val('glitch.noise');
      u.u_jitter.value = val('glitch.jitter');
      u.u_bright.value = val('glitch.bright');
      u.u_cont.value = val('glitch.cont');
      u.u_sat.value = val('glitch.sat');
      u.u_hue.value = (val('glitch.hue') * Math.PI) / 180;
      u.u_invert.value = val('glitch.invert');
      stages.push(this.glitchMat);
    }
    if (stages.length === 0) stages.push(this.copyMat);

    let current: THREE.Texture = this.sourceTex;
    let write = 0;
    stages.forEach((mat, i) => {
      if (i === nexusIndex) {
        this.renderNexus(state, current, val, t, delta, size);
        mat.uniforms.tNexus.value = this.composer.readBuffer.texture;
        mat.uniforms.u_backdrop.value = val('nexus.backdrop');
      }
      mat.uniforms.tDiffuse.value = current;
      this.quad.material = mat;
      const last = i === stages.length - 1;
      this.renderer.setRenderTarget(last ? null : this.targets[write]);
      this.renderer.render(this.quadScene, this.quadCam);
      if (!last) {
        current = this.targets[write].texture;
        write = 1 - write;
      }
    });

    // 4. Spark limpio, encima de todo
    if (state.on.spark && !state.sparkInSignal) {
      this.hudCtx.clearRect(0, 0, w, h);
      this.tracker.draw(this.hudCtx, w, h, t, sparkGain, sparkArc);
      this.hudTex.needsUpdate = true;
      (this.quad as THREE.Mesh).material = this.hudMat;
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.quadScene, this.quadCam);
    }

    this.frames++;
    const now = performance.now();
    if (now - this.fpsStamp >= 500) {
      this.telemetry.fps = Math.round((this.frames * 1000) / (now - this.fpsStamp));
      this.frames = 0;
      this.fpsStamp = now;
    }
  };

  private renderNexus(
    state: FusionState,
    frame: THREE.Texture,
    val: (id: string) => number,
    t: number,
    delta: number,
    size: THREE.Vector2
  ) {
    const density = Math.round(Math.min(val('nexus.density'), state.lite ? 100 : 300) / 5) * 5;
    if (density !== this.nexusDensity) this.buildNexus(density);

    const u = this.nexusMat.uniforms;
    u.tDiffuse.value = frame;
    u.u_aspect.value = size.x / size.y;
    // El tamaño de punto original estaba pensado para ~1080 px de alto
    u.u_pointSize.value = val('nexus.size') * (size.y / 1080);
    u.u_zExtrusion.value = val('nexus.z');
    u.u_morph.value = val('nexus.morph');
    u.u_bass.value = this.signals.bass;
    u.u_time.value = t;
    u.u_turbulence.value = val('nexus.turbulence');
    u.u_shape.value = state.nexusShape;
    u.u_colorMode.value = state.nexusDepthColor ? 1 : 0;
    u.u_colorNear.value.set(state.colorA);
    u.u_colorDeep.value.set(state.colorB);
    u.u_chroma.value = val('nexus.chroma');
    this.bloom.strength = val('nexus.bloom');

    this.yaw += val('nexus.spin') * delta;
    // Sin morph la nube es un plano: el giro se limita a un vaivén para no verla de canto
    const morph = u.u_morph.value as number;
    const yaw = morph > 0.5 ? this.yaw : Math.sin(this.yaw) * 0.7;
    const dist = 4;
    this.nexusCam.position.set(
      Math.sin(yaw) * Math.cos(this.pitch) * dist,
      Math.sin(this.pitch) * dist,
      Math.cos(yaw) * Math.cos(this.pitch) * dist
    );
    this.nexusCam.lookAt(0, 0, 0);
    this.composer.render(delta);
  }

  /* ------------------------------- captura ------------------------------- */

  capturePhoto(stamp: string): string {
    const src = this.renderer.domElement;
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext('2d')!;
    ctx.drawImage(src, 0, 0);
    const unit = out.height / 720;
    const pad = 18 * unit;
    ctx.font = `700 ${15 * unit}px Orbitron, monospace`;
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(5,5,5,0.72)';
    const label = 'SGX DESMADRE';
    const labelW = ctx.measureText(label).width;
    ctx.font = `${12 * unit}px "Share Tech Mono", monospace`;
    const stampW = ctx.measureText(stamp).width;
    ctx.fillRect(pad * 0.5, out.height - pad * 3.1, Math.max(labelW * 1.25, stampW) + pad * 1.2, pad * 2.7);
    ctx.fillStyle = '#FDCC0D';
    ctx.font = `700 ${15 * unit}px Orbitron, monospace`;
    ctx.fillText(label, pad, out.height - pad * 1.75);
    ctx.fillStyle = '#00DDFF';
    ctx.font = `${12 * unit}px "Share Tech Mono", monospace`;
    ctx.fillText(stamp, pad, out.height - pad * 0.75);
    return out.toDataURL('image/jpeg', 0.92);
  }

  get recording(): boolean {
    return !!this.recorder;
  }

  startRecording(onStop: (url: string, mime: string) => void): boolean {
    if (this.recorder || typeof MediaRecorder === 'undefined') return false;
    const stream = this.renderer.domElement.captureStream(30);
    this.audio.micStream?.getAudioTracks().forEach((track) => stream.addTrack(track));
    const mime = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) return false;
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      this.recorder = null;
      onStop(URL.createObjectURL(new Blob(chunks, { type: mime })), mime);
    };
    recorder.start();
    this.recorder = recorder;
    return true;
  }

  stopRecording() {
    this.recorder?.stop();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.sourceSession++;
    this.recorder?.stop();
    this.resizeObserver.disconnect();
    window.removeEventListener('pointerup', this.onPointerUp);
    this.releaseSource();
    this.audio.disableMic();
    if (this.file) URL.revokeObjectURL(this.file.url);
    this.targets.forEach((t) => t.dispose());
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
