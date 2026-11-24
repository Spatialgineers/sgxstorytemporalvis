import { DECADES, SPLIT_LAYOUTS, type SplitLayout } from '../data/decades';

/** Los cinco motores, en el orden en que la señal los atraviesa. */
export const ENGINE_IDS = ['story', 'spark', 'synth', 'nexus', 'glitch'] as const;
export type EngineId = (typeof ENGINE_IDS)[number];

export interface EngineInfo {
  id: EngineId;
  index: string;
  name: string;
  origin: string;
  role: string;
  color: string;
}

export const ENGINES: Record<EngineId, EngineInfo> = {
  story: { id: 'story', index: '01', name: 'STORY', origin: 'Story Time', role: 'Época y emulsión', color: '#32527B' },
  spark: { id: 'spark', index: '02', name: 'SPARK', origin: 'Spark Vision', role: 'Manos, rostro y arcos', color: '#B87000' },
  synth: { id: 'synth', index: '03', name: 'SYNTH', origin: 'Synthesize Visualizer', role: '25 motores de imagen', color: '#FFFFFF' },
  nexus: { id: 'nexus', index: '04', name: 'NEXUS', origin: 'Nexus Scanner', role: 'Nube de puntos 3D', color: '#00DDFF' },
  glitch: { id: 'glitch', index: '05', name: 'GLITCH', origin: 'Glitch Master', role: 'Corrupción y gradación', color: '#FDCC0D' },
};

export interface ParamDef {
  id: string;
  engine: EngineId;
  label: string;
  min: number;
  max: number;
  step: number;
  def: number;
  unit?: string;
}

const P = (
  id: string,
  label: string,
  min: number,
  max: number,
  def: number,
  step = 0.01,
  unit?: string
): ParamDef => ({ id, engine: id.split('.')[0] as EngineId, label, min, max, step, def, unit });

export const PARAMS: ParamDef[] = [
  P('story.intensity', 'Intensidad', 0, 1.5, 1),
  P('story.scale', 'Escala', 0.5, 2, 1),
  P('story.grain', 'Grano', 0, 1, 0.35),
  P('story.tint', 'Tinte de paleta', 0, 1, 0),
  P('story.maskScale', 'Escala de máscara', 0.25, 2, 0.85),

  P('spark.gain', 'Brillo del HUD', 0, 1, 0.9),
  P('spark.arc', 'Fuerza del arco', 0, 1, 0.8),
  P('spark.charge', 'Velocidad de carga', 0, 1, 0.5),

  P('synth.intensity', 'Intensidad', 0, 1, 0.6),
  P('synth.scale', 'Escala', 0.2, 5, 1),
  P('synth.bloom', 'Bloom', 0, 1, 0.3),
  P('synth.audio', 'Reacción al audio', 0, 1, 0.6),
  P('synth.invert', 'Invertir', 0, 1, 0),
  P('synth.maskScale', 'Escala de máscara', 0.25, 2.2, 0.86),
  P('synth.maskOpacity', 'Opacidad de máscara', 0.05, 1, 0.9),

  P('nexus.density', 'Densidad', 50, 300, 150, 5),
  P('nexus.morph', 'Morph a esfera', 0, 1, 0),
  P('nexus.z', 'Extrusión Z', 0, 10, 2.2, 0.05),
  P('nexus.size', 'Masa de partícula', 1, 30, 7, 0.5),
  P('nexus.turbulence', 'Turbulencia de bajos', 0, 3, 1),
  P('nexus.chroma', 'Croma', 0, 0.5, 0, 0.005),
  P('nexus.bloom', 'Brillo holográfico', 0, 3, 0.8),
  P('nexus.spin', 'Giro', -1, 1, 0.15),
  P('nexus.backdrop', 'Señal 2D de fondo', 0, 1, 0.25),

  P('glitch.block', 'Bloques', 0, 1, 0),
  P('glitch.tear', 'Rasgado de línea', 0, 1, 0),
  P('glitch.wave', 'Onda', 0, 1, 0),
  P('glitch.pixel', 'Pixelado', 0, 1, 0),
  P('glitch.rgbX', 'RGB X', -1, 1, 0),
  P('glitch.rgbY', 'RGB Y', -1, 1, 0),
  P('glitch.bleed', 'Sangrado VHS', 0, 1, 0),
  P('glitch.crt', 'Líneas CRT', 0, 1, 0),
  P('glitch.noise', 'Estática', 0, 1, 0),
  P('glitch.jitter', 'Jitter VHS', 0, 1, 0),
  P('glitch.speed', 'Velocidad', 0, 3, 1),
  P('glitch.bright', 'Brillo', 0, 2, 1),
  P('glitch.cont', 'Contraste', 0, 2, 1),
  P('glitch.sat', 'Saturación', 0, 3, 1),
  P('glitch.hue', 'Tono', -180, 180, 0, 1, '°'),
  P('glitch.invert', 'Invertir', 0, 1, 0),
];

export const PARAM_MAP: Record<string, ParamDef> = Object.fromEntries(PARAMS.map((d) => [d.id, d]));

/** Señales vivas que cualquier motor puede escuchar. */
export const SIGNALS = [
  { id: 'bass', label: 'Bajos', group: 'Audio' },
  { id: 'mid', label: 'Medios', group: 'Audio' },
  { id: 'high', label: 'Agudos', group: 'Audio' },
  { id: 'beat', label: 'Golpe', group: 'Audio' },
  { id: 'handX', label: 'Mano X', group: 'Spark' },
  { id: 'handY', label: 'Mano Y', group: 'Spark' },
  { id: 'span', label: 'Distancia entre manos', group: 'Spark' },
  { id: 'pinch', label: 'Pinza', group: 'Spark' },
  { id: 'mouth', label: 'Boca', group: 'Spark' },
  { id: 'energy', label: 'Carga Spark', group: 'Spark' },
  { id: 'pointerX', label: 'Puntero X', group: 'Manual' },
  { id: 'pointerY', label: 'Puntero Y', group: 'Manual' },
  { id: 'lfo', label: 'Onda lenta', group: 'Manual' },
] as const;
export type SignalId = (typeof SIGNALS)[number]['id'];
export const SIGNAL_IDS = SIGNALS.map((s) => s.id) as SignalId[];

export interface Route {
  src: SignalId;
  dst: string;
  amt: number;
}

export const MAX_ROUTES = 8;

export const SYNTH_MODES = [
  'SPIDER VERSE', 'DATA MOSH', 'FLUID FBM', 'SOBEL NEON', 'KINETIC RIPPLE', 'CRT PHOSPHOR', 'CHROMA PRISM',
  'DEPTH TOPO', 'ASCII MATRIX', 'THERMAL SGX', 'SGX ENERGY', 'SGX TUNNEL', 'KALEIDO PRISM', 'HOLO WIRE',
  'PIXEL SORT', 'CYBER INK', 'TESLA ARC', 'REACTOR PULSE', 'MATERIALIZE', 'PLASMA SURGE', 'ANIME CEL',
  'MANGA PANEL', 'CARTOON DOODLE', 'SGX BLUEPRINT', 'SGX OVERDRIVE',
];

export const NEXUS_SHAPES = ['Círculo gaussiano', 'Anillo holo', 'Píxel de dato', 'Cruz táctica'];

export const MASKS = [
  { id: 'story', label: 'Story', src: '/masks/pillars/story.png' },
  { id: 'showcase', label: 'Showcase', src: '/masks/pillars/showcase.png' },
  { id: 'spark', label: 'Spark', src: '/masks/pillars/spark.png' },
  { id: 'stage', label: 'Stage', src: '/masks/pillars/stage.png' },
  { id: 'system', label: 'System', src: '/masks/pillars/system.png' },
  { id: 'synthesize', label: 'Synthesize', src: '/masks/pillars/synthesize.png' },
  { id: 'sgx', label: 'Logo SGX', src: '/masks/pillars/sgx-logo.png' },
];

export const PALETTES = [
  { a: '#fdcc0d', b: '#00ddff' },
  { a: '#ffbb00', b: '#00ddff' },
  { a: '#00ddff', b: '#fdcc0d' },
  { a: '#5f86b4', b: '#00ddff' },
  { a: '#ffffff', b: '#fdcc0d' },
  { a: '#b87000', b: '#fdcc0d' },
];

export type SourceMode = 'signal' | 'camera' | 'plate' | 'file';
export type AudioMode = 'sim' | 'mic' | 'off';

export interface FusionState {
  on: Record<EngineId, boolean>;
  p: Record<string, number>;
  source: SourceMode;
  plateId: string;
  mirror: boolean;
  audio: AudioMode;
  colorA: string;
  colorB: string;
  maskId: string;
  storyYear: number;
  storyVariant: number;
  storyLayout: SplitLayout;
  synthMode: number;
  /** -1 = un solo motor; 0+ = segundo motor dentro de la máscara */
  synthModeB: number;
  synthMirror: number;
  nexusShape: number;
  nexusDepthColor: boolean;
  /** true: el HUD de Spark entra a la señal y los demás motores lo procesan */
  sparkInSignal: boolean;
  routes: Route[];
  lite: boolean;
}

export function defaultParams(): Record<string, number> {
  return Object.fromEntries(PARAMS.map((d) => [d.id, d.def]));
}

export function defaultState(): FusionState {
  return {
    on: { story: true, spark: true, synth: false, nexus: false, glitch: true },
    p: { ...defaultParams(), 'glitch.crt': 0.25, 'glitch.rgbX': 0.05 },
    source: 'signal',
    plateId: 'street',
    mirror: true,
    audio: 'sim',
    colorA: '#fdcc0d',
    colorB: '#00ddff',
    maskId: 'synthesize',
    storyYear: 1980,
    storyVariant: 0,
    storyLayout: 'single',
    synthMode: 0,
    synthModeB: -1,
    synthMirror: 0,
    nexusShape: 0,
    nexusDepthColor: false,
    sparkInSignal: true,
    routes: [
      { src: 'bass', dst: 'glitch.rgbX', amt: 0.12 },
      { src: 'energy', dst: 'story.grain', amt: 0.4 },
    ],
    lite: false,
  };
}

/** Valor efectivo de un parámetro: base + lo que le suman las rutas activas. */
export function resolveParam(state: FusionState, signals: Record<SignalId, number>, id: string): number {
  const def = PARAM_MAP[id];
  let v = state.p[id] ?? def.def;
  for (const r of state.routes) {
    if (r.dst === id) v += signals[r.src] * r.amt * (def.max - def.min);
  }
  return Math.min(def.max, Math.max(def.min, v));
}

/* ------------------------------------------------------------------ */
/* Recetas: una mezcla de motores por pilar                            */
/* ------------------------------------------------------------------ */

export interface Recipe {
  id: string;
  pillar: string;
  title: string;
  color: string;
  note: string;
  apply: Partial<Omit<FusionState, 'p' | 'on'>> & { on: Record<EngineId, boolean>; p: Record<string, number> };
}

const eng = (story: boolean, spark: boolean, synth: boolean, nexus: boolean, glitch: boolean) => ({
  story, spark, synth, nexus, glitch,
});

export const RECIPES: Recipe[] = [
  {
    id: 'story',
    pillar: 'SGX.Story',
    title: 'Memoria',
    color: '#32527B',
    note: 'Años 30 con cinta VHS gastada encima',
    apply: {
      on: eng(true, false, false, false, true),
      storyYear: 1930, storyVariant: 0, storyLayout: 'single', maskId: 'story',
      colorA: '#5f86b4', colorB: '#00ddff',
      p: { 'story.grain': 0.6, 'glitch.bleed': 0.45, 'glitch.jitter': 0.2, 'glitch.crt': 0.35, 'glitch.noise': 0.12 },
      routes: [{ src: 'bass', dst: 'story.grain', amt: 0.3 }, { src: 'beat', dst: 'glitch.jitter', amt: 0.3 }],
    },
  },
  {
    id: 'showcase',
    pillar: 'SGX.Showcase',
    title: 'Holograma',
    color: '#00DDFF',
    note: 'La imagen se vuelve relieve 3D; las manos lo abren',
    apply: {
      on: eng(true, true, true, true, false),
      storyYear: 2050, storyVariant: 1, storyLayout: 'single', maskId: 'showcase',
      synthMode: 13, synthModeB: -1, nexusShape: 1, nexusDepthColor: true, sparkInSignal: false,
      colorA: '#00ddff', colorB: '#fdcc0d',
      p: { 'synth.intensity': 0.5, 'nexus.z': 3.2, 'nexus.size': 8, 'nexus.backdrop': 0.12, 'nexus.spin': 0.2 },
      routes: [
        { src: 'span', dst: 'nexus.morph', amt: 1 },
        { src: 'handX', dst: 'nexus.spin', amt: 0.5 },
        { src: 'bass', dst: 'nexus.z', amt: 0.2 },
      ],
    },
  },
  {
    id: 'spark',
    pillar: 'SGX.Spark',
    title: 'Arco',
    color: '#B87000',
    note: 'Los rayos de tus manos entran a la señal y la rompen',
    apply: {
      on: eng(false, true, true, false, true),
      maskId: 'spark', synthMode: 16, synthModeB: 19, sparkInSignal: true,
      colorA: '#ffbb00', colorB: '#00ddff',
      p: { 'synth.intensity': 0.55, 'spark.arc': 1, 'spark.charge': 0.8, 'glitch.sat': 1.3 },
      routes: [
        { src: 'pinch', dst: 'glitch.block', amt: 0.6 },
        { src: 'energy', dst: 'synth.intensity', amt: 0.4 },
        { src: 'span', dst: 'glitch.tear', amt: 0.35 },
      ],
    },
  },
  {
    id: 'stage',
    pillar: 'SGX.Stage',
    title: 'Túnel',
    color: '#FDCC0D',
    note: 'Visual de tarima: túnel y reactor al ritmo del audio',
    apply: {
      on: eng(true, false, true, false, true),
      storyYear: 1980, storyVariant: 2, storyLayout: 'single', maskId: 'stage',
      synthMode: 11, synthModeB: 17, synthMirror: 1,
      colorA: '#fdcc0d', colorB: '#00ddff',
      p: { 'story.intensity': 0.7, 'synth.intensity': 0.7, 'synth.audio': 0.9, 'synth.bloom': 0.5 },
      routes: [
        { src: 'bass', dst: 'glitch.rgbX', amt: 0.3 },
        { src: 'beat', dst: 'glitch.wave', amt: 0.25 },
        { src: 'high', dst: 'glitch.noise', amt: 0.3 },
      ],
    },
  },
  {
    id: 'system',
    pillar: 'SGX.System',
    title: 'Plano',
    color: '#888888',
    note: 'Lectura de máquina: ASCII, plano técnico y píxel',
    apply: {
      on: eng(false, true, true, false, true),
      maskId: 'system', synthMode: 8, synthModeB: 23, sparkInSignal: false,
      colorA: '#00ddff', colorB: '#ffffff',
      p: { 'synth.intensity': 0.65, 'glitch.pixel': 0.12, 'glitch.crt': 0.45, 'glitch.sat': 0.6 },
      routes: [{ src: 'mouth', dst: 'glitch.pixel', amt: 0.5 }, { src: 'lfo', dst: 'synth.scale', amt: 0.15 }],
    },
  },
  {
    id: 'synthesize',
    pillar: 'SGX.Synthesize',
    title: 'Todo',
    color: '#FFFFFF',
    note: 'Los cinco motores a la vez',
    apply: {
      on: eng(true, true, true, true, true),
      storyYear: 2090, storyVariant: 0, storyLayout: 'single', maskId: 'synthesize',
      synthMode: 0, synthModeB: 24, nexusShape: 0, nexusDepthColor: false, sparkInSignal: true,
      colorA: '#fdcc0d', colorB: '#00ddff',
      p: {
        'story.intensity': 0.8, 'synth.intensity': 0.5, 'nexus.backdrop': 0.45, 'nexus.z': 1.6,
        'nexus.size': 3.5, 'nexus.bloom': 0.45, 'glitch.crt': 0.2, 'glitch.bleed': 0.2,
      },
      routes: [
        { src: 'bass', dst: 'nexus.z', amt: 0.25 },
        { src: 'span', dst: 'nexus.morph', amt: 0.8 },
        { src: 'beat', dst: 'glitch.rgbX', amt: 0.25 },
        { src: 'pinch', dst: 'glitch.block', amt: 0.5 },
        { src: 'energy', dst: 'story.grain', amt: 0.5 },
      ],
    },
  },
];

export function applyRecipe(state: FusionState, recipe: Recipe): FusionState {
  const { p, on, ...rest } = recipe.apply;
  return { ...state, ...rest, on: { ...on }, p: { ...defaultParams(), ...p }, routes: [...(rest.routes ?? [])] };
}

const rnd = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

/** DESMADRE: muta todos los motores a la vez, dentro de rangos que siguen siendo legibles. */
export function desmadre(state: FusionState): FusionState {
  const p = defaultParams();
  const set = (id: string, lo: number, hi: number, chance = 1) => {
    if (Math.random() < chance) p[id] = rnd(lo, hi);
  };
  set('story.intensity', 0.5, 1.2);
  set('story.grain', 0.1, 0.8);
  set('story.tint', 0.1, 0.5, 0.3);
  set('synth.intensity', 0.35, 0.85);
  set('synth.scale', 0.6, 2.2);
  set('synth.bloom', 0.1, 0.7);
  set('nexus.morph', 0, 1, 0.5);
  set('nexus.z', 0.8, 5);
  set('nexus.size', 3, 14);
  set('nexus.backdrop', 0, 0.8);
  set('nexus.spin', -0.6, 0.6);
  set('glitch.block', 0, 0.5, 0.5);
  set('glitch.tear', 0, 0.5, 0.5);
  set('glitch.wave', 0, 0.4, 0.4);
  set('glitch.rgbX', -0.4, 0.4, 0.7);
  set('glitch.rgbY', -0.3, 0.3, 0.4);
  set('glitch.bleed', 0, 0.8, 0.5);
  set('glitch.crt', 0, 0.8, 0.6);
  set('glitch.noise', 0, 0.4, 0.5);
  set('glitch.jitter', 0, 0.4, 0.4);
  set('glitch.hue', -60, 60, 0.3);

  const on = {
    story: Math.random() < 0.7,
    spark: Math.random() < 0.7,
    synth: Math.random() < 0.75,
    nexus: Math.random() < 0.4,
    glitch: Math.random() < 0.85,
  };
  if (!Object.values(on).some(Boolean)) on.synth = true;

  const palette = pick(PALETTES);
  const targets = PARAMS.filter((d) => on[d.engine] && d.id !== 'nexus.density' && !d.id.endsWith('invert'));
  const routes: Route[] = Array.from({ length: 4 }, () => ({
    src: pick(SIGNAL_IDS),
    dst: pick(targets).id,
    amt: Math.round(rnd(0.15, 0.6) * (Math.random() < 0.2 ? -1 : 1) * 100) / 100,
  }));

  return {
    ...state,
    on,
    p,
    colorA: palette.a,
    colorB: palette.b,
    maskId: pick(MASKS).id,
    storyYear: pick(DECADES).year,
    storyVariant: Math.floor(Math.random() * 3),
    storyLayout: Math.random() < 0.3 ? pick(SPLIT_LAYOUTS).id : 'single',
    synthMode: Math.floor(Math.random() * SYNTH_MODES.length),
    synthModeB: Math.random() < 0.5 ? Math.floor(Math.random() * SYNTH_MODES.length) : -1,
    synthMirror: Math.random() < 0.25 ? 1 + Math.floor(Math.random() * 2) : 0,
    nexusShape: Math.floor(Math.random() * NEXUS_SHAPES.length),
    nexusDepthColor: Math.random() < 0.4,
    sparkInSignal: Math.random() < 0.6,
    routes,
  };
}

/* ------------------------------------------------------------------ */
/* Validación de estado entrante (control remoto)                      */
/* ------------------------------------------------------------------ */

const HEX = /^#[0-9a-fA-F]{6}$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const int = (v: unknown, lo: number, hi: number, fb: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : fb;

/**
 * Lo que manda un control remoto llega de otro dispositivo: se copia campo por campo,
 * con rangos, y nunca cambia la fuente ni el audio del host.
 */
export function sanitizeRemoteState(incoming: unknown, current: FusionState): FusionState {
  if (!isObj(incoming)) return current;
  const next: FusionState = { ...current, on: { ...current.on }, p: { ...current.p } };

  if (isObj(incoming.on)) {
    for (const id of ENGINE_IDS) if (typeof incoming.on[id] === 'boolean') next.on[id] = incoming.on[id] as boolean;
  }
  if (isObj(incoming.p)) {
    for (const def of PARAMS) {
      const v = incoming.p[def.id];
      if (typeof v === 'number' && Number.isFinite(v)) next.p[def.id] = Math.min(def.max, Math.max(def.min, v));
    }
  }
  if (typeof incoming.colorA === 'string' && HEX.test(incoming.colorA)) next.colorA = incoming.colorA;
  if (typeof incoming.colorB === 'string' && HEX.test(incoming.colorB)) next.colorB = incoming.colorB;
  if (MASKS.some((m) => m.id === incoming.maskId)) next.maskId = incoming.maskId as string;
  if (DECADES.some((d) => d.year === incoming.storyYear)) next.storyYear = incoming.storyYear as number;
  next.storyVariant = int(incoming.storyVariant, 0, 2, next.storyVariant);
  if (SPLIT_LAYOUTS.some((l) => l.id === incoming.storyLayout)) next.storyLayout = incoming.storyLayout as SplitLayout;
  next.synthMode = int(incoming.synthMode, 0, SYNTH_MODES.length - 1, next.synthMode);
  next.synthModeB = int(incoming.synthModeB, -1, SYNTH_MODES.length - 1, next.synthModeB);
  next.synthMirror = int(incoming.synthMirror, 0, 2, next.synthMirror);
  next.nexusShape = int(incoming.nexusShape, 0, NEXUS_SHAPES.length - 1, next.nexusShape);
  if (typeof incoming.nexusDepthColor === 'boolean') next.nexusDepthColor = incoming.nexusDepthColor;
  if (typeof incoming.sparkInSignal === 'boolean') next.sparkInSignal = incoming.sparkInSignal;
  if (Array.isArray(incoming.routes)) {
    next.routes = incoming.routes
      .filter(
        (r): r is Route =>
          isObj(r) &&
          SIGNAL_IDS.includes(r.src as SignalId) &&
          typeof r.dst === 'string' &&
          Object.hasOwn(PARAM_MAP, r.dst) &&
          typeof r.amt === 'number' &&
          Number.isFinite(r.amt)
      )
      .slice(0, MAX_ROUTES)
      .map((r) => ({ src: r.src, dst: r.dst, amt: Math.min(1, Math.max(-1, r.amt)) }));
  }
  return next;
}
