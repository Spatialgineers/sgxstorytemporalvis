export type SgxPillarId =
  | 'story'
  | 'showcase'
  | 'spark'
  | 'stage'
  | 'system'
  | 'synthesize';

export interface SgxPillarMask {
  id: string;
  pillarId: SgxPillarId;
  name: string;
  shortName: string;
  guildRole: string;
  tagline: string;
  color: string;
  /** True when the pillar accent color is bright enough to require dark text on top */
  darkTextOnAccent: boolean;
  src: string;
  recommendedInsideYear: number;
  recommendedOutsideYear: number;
}

export interface AlphaMaskPreset {
  id: string;
  label: string;
  note: string;
  src?: string;
}

/**
 * Official 6 SGX Pillars from Spatialgineers MCP (brand order & SGX Design System v2026.10 colors).
 * Full-color 1600x1600 RGBA PNGs downloaded locally; the WebGL shader extracts their alpha channel
 * so any colored pillar emblem works purely as a dual-era silhouette mask.
 */
export const SGX_PILLAR_MASKS: SgxPillarMask[] = [
  {
    id: 'pillar-story',
    pillarId: 'story',
    name: 'SGX.Story',
    shortName: 'Story',
    guildRole: 'Storytellers',
    tagline: 'Narrativa & Cine',
    color: '#32527B',
    darkTextOnAccent: false,
    src: '/masks/pillars/story.png',
    recommendedInsideYear: 1930,
    recommendedOutsideYear: 2020,
  },
  {
    id: 'pillar-showcase',
    pillarId: 'showcase',
    name: 'SGX.Showcase',
    shortName: 'Showcase',
    guildRole: 'Showcasers',
    tagline: 'Exhibición & Óptica',
    color: '#00DDFF',
    darkTextOnAccent: true,
    src: '/masks/pillars/showcase.png',
    recommendedInsideYear: 2030,
    recommendedOutsideYear: 2020,
  },
  {
    id: 'pillar-spark',
    pillarId: 'spark',
    name: 'SGX.Spark',
    shortName: 'Spark',
    guildRole: 'Sparkers',
    tagline: 'Chispa & Energía',
    color: '#B87000',
    darkTextOnAccent: false,
    src: '/masks/pillars/spark.png',
    recommendedInsideYear: 1980,
    recommendedOutsideYear: 1970,
  },
  {
    id: 'pillar-stage',
    pillarId: 'stage',
    name: 'SGX.Stage',
    shortName: 'Stage',
    guildRole: 'Stagers',
    tagline: 'Escenario & Vivo',
    color: '#FDCC0D',
    darkTextOnAccent: true,
    src: '/masks/pillars/stage.png',
    recommendedInsideYear: 1990,
    recommendedOutsideYear: 2050,
  },
  {
    id: 'pillar-system',
    pillarId: 'system',
    name: 'SGX.System',
    shortName: 'System',
    guildRole: 'Systematizers',
    tagline: 'Sistemas & Código',
    color: '#888888',
    darkTextOnAccent: true,
    src: '/masks/pillars/system.png',
    recommendedInsideYear: 2000,
    recommendedOutsideYear: 1940,
  },
  {
    id: 'pillar-synthesize',
    pillarId: 'synthesize',
    name: 'SGX.Synthesize',
    shortName: 'Synthesize',
    guildRole: 'Synthesizers',
    tagline: 'Síntesis & Futuro',
    color: '#FFFFFF',
    darkTextOnAccent: true,
    src: '/masks/pillars/synthesize.png',
    recommendedInsideYear: 2090,
    recommendedOutsideYear: 1890,
  },
];

export const BUILTIN_MASKS: AlphaMaskPreset[] = [
  {
    id: 'sgx-logo',
    label: 'Logo SGX',
    note: 'Logotipo oficial Spatialgineers (MCP)',
    src: '/masks/pillars/sgx-logo.png',
  },
  { id: 'sgx-bolt', label: 'Rayo SGX', note: 'Silueta oficial del rayo Spatialgineers' },
  { id: 'sgx-gear', label: 'Engranaje', note: 'Engranaje mecánico de precisión' },
  { id: 'portal', label: 'Portal', note: 'Ventana circular hacia otra época' },
  { id: 'chamfer', label: 'Marco 45°', note: 'Octágono chaflanado SGX' },
  { id: 'diagonal', label: 'Diagonal', note: 'Corte diagonal clásico en dos eras' },
  { id: 'diamond', label: 'Prisma', note: 'Rombo geométrico central' },
];

export function findPillarMaskById(maskId: string): SgxPillarMask | null {
  return SGX_PILLAR_MASKS.find((p) => p.id === maskId) ?? null;
}

const cachedMaskUrls = new Map<string, string>();

/**
 * Resolves any built-in mask ID (either one of the 6 official MCP Pillar PNGs, the SGX Logo PNG,
 * or a procedurally generated 1024x1024 geometric alpha mask).
 * Opaque pixels (alpha = 255) map to Zone 1 (Inside); transparent pixels (alpha = 0) map to Zone 2 (Outside).
 */
export function getBuiltinMaskDataUrl(maskId: string): string {
  const pillar = SGX_PILLAR_MASKS.find((p) => p.id === maskId);
  if (pillar) return pillar.src;

  const preset = BUILTIN_MASKS.find((m) => m.id === maskId);
  if (preset?.src) return preset.src;

  const cached = cachedMaskUrls.get(maskId);
  if (cached) return cached;

  if (typeof document === 'undefined') return '';

  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#FFFFFF';

  if (maskId === 'sgx-bolt') {
    ctx.save();
    const scale = 3.25;
    const offsetX = (size - 208 * scale) * 0.5;
    const offsetY = (size - 258 * scale) * 0.5;
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    const p = new Path2D(
      'M167.278 0L70.2073 39.2116L0 183.748L78.4193 153.204L53.7867 258L207.289 101.663L128.431 124.222L167.278 0Z'
    );
    ctx.fill(p);
    ctx.restore();
  } else if (maskId === 'sgx-gear') {
    ctx.save();
    const scale = 4.6;
    const offsetX = (size - 184 * scale) * 0.5;
    const offsetY = (size - 184 * scale) * 0.5;
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    const p = new Path2D(
      'M184 109.162V74.8384L159.439 70.6696C157.878 65.4301 155.814 60.4158 153.284 55.6897L167.694 35.3516L143.397 11.0801L123.035 25.4757C118.305 22.9481 113.284 20.8856 108.039 19.3264L103.866 0H69.5065L65.3324 19.3264C60.0872 20.8856 55.0672 22.9481 50.336 25.4757L29.9746 11.0801L5.67783 35.3516L20.0884 55.6897C17.5582 60.4158 15.4935 65.4301 13.9325 70.6696L0 74.8384V109.162L13.9325 113.33C15.4935 118.57 17.5582 123.584 20.0884 128.31L5.67783 148.648L29.9746 172.92L50.336 158.524C55.0672 161.052 60.0872 163.114 65.3324 164.674L69.5065 184H103.866L108.039 164.674C113.284 163.114 118.305 161.052 123.035 158.524L143.397 172.92L167.694 148.648L153.284 128.31C155.814 123.584 157.878 118.57 159.439 113.33L184 109.162Z'
    );
    ctx.fill(p);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(92, 92, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (maskId === 'portal') {
    ctx.beginPath();
    ctx.arc(size * 0.5, size * 0.5, size * 0.36, 0, Math.PI * 2);
    ctx.fill();
  } else if (maskId === 'chamfer') {
    const pad = size * 0.14;
    const cut = size * 0.14;
    ctx.beginPath();
    ctx.moveTo(pad + cut, pad);
    ctx.lineTo(size - pad - cut, pad);
    ctx.lineTo(size - pad, pad + cut);
    ctx.lineTo(size - pad, size - pad - cut);
    ctx.lineTo(size - pad - cut, size - pad);
    ctx.lineTo(pad + cut, size - pad);
    ctx.lineTo(pad, size - pad - cut);
    ctx.lineTo(pad, pad + cut);
    ctx.closePath();
    ctx.fill();
  } else if (maskId === 'diagonal') {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size, 0);
    ctx.lineTo(0, size);
    ctx.closePath();
    ctx.fill();
  } else {
    const cx = size * 0.5;
    const cy = size * 0.5;
    const rx = size * 0.36;
    const ry = size * 0.44;
    ctx.beginPath();
    ctx.moveTo(cx, cy - ry);
    ctx.lineTo(cx + rx, cy);
    ctx.lineTo(cx, cy + ry);
    ctx.lineTo(cx - rx, cy);
    ctx.closePath();
    ctx.fill();
  }

  const url = canvas.toDataURL('image/png');
  cachedMaskUrls.set(maskId, url);
  return url;
}
