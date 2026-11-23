export interface EraVariant {
  id: string;
  index: 0 | 1 | 2;
  label: string;
  note: string;
  intensityMul?: number;
  scaleMul?: number;
  grainMul?: number;
}

export interface DecadePreset {
  year: number;
  shortLabel: string;
  label: string;
  title: string;
  medium: string;
  eraGroup: 'origen' | 'analogico' | 'digital' | 'espacial';
  description: string;
  storyPrompt: string;
  defaultIntensity: number;
  defaultScale: number;
  defaultGrain: number;
  variants: [EraVariant, EraVariant, EraVariant];
}

export type FrameAspectId = 'full' | 'scope' | 'classic' | 'story';

export interface FrameAspectOption {
  id: FrameAspectId;
  label: string;
  ratio: number; // 0 = fill viewport
  tag: string;
}

export const FRAME_ASPECTS: FrameAspectOption[] = [
  { id: 'full', label: 'Completo', ratio: 0, tag: '16:9' },
  { id: 'scope', label: 'Cinema', ratio: 2.39, tag: '2.39:1' },
  { id: 'classic', label: 'Clásico', ratio: 4 / 3, tag: '4:3' },
  { id: 'story', label: 'Story', ratio: 9 / 16, tag: '9:16' },
];

export type SplitLayout =
  | 'single'
  | 'ab'
  | 'dual'
  | 'dualH'
  | 'trio'
  | 'quad'
  | 'hex'
  | 'grid9'
  | 'mask';

export interface SplitLayoutOption {
  id: SplitLayout;
  shortLabel: string;
  label: string;
  zones: number;
}

export const SPLIT_LAYOUTS: SplitLayoutOption[] = [
  { id: 'single', shortLabel: '1×', label: 'Una Era', zones: 1 },
  { id: 'ab', shortLabel: 'A/B', label: 'Original vs Era', zones: 1 },
  { id: 'dual', shortLabel: '2×', label: 'Dúo Vertical', zones: 2 },
  { id: 'dualH', shortLabel: '2×H', label: 'Dúo Horizontal', zones: 2 },
  { id: 'trio', shortLabel: '3×', label: 'Trío Vivo', zones: 3 },
  { id: 'quad', shortLabel: '4×', label: 'Cuadrante 2×2', zones: 4 },
  { id: 'hex', shortLabel: '6×', label: 'Mosaico 3×2', zones: 6 },
  { id: 'grid9', shortLabel: '9×', label: 'Mosaico 3×3', zones: 9 },
  { id: 'mask', shortLabel: 'MASK', label: 'Máscara Alfa', zones: 2 },
];

export const DECADES: DecadePreset[] = [
  {
    year: 1890,
    shortLabel: '1890',
    label: '1890s',
    title: 'Daguerrotipo & Plata',
    medium: 'PLACA HÚMEDA',
    eraGroup: 'origen',
    description: 'Emulsión química de colodión, bordes oxidados y grano fino de laboratorio decimonónico.',
    storyPrompt: 'Crónica de placa húmeda',
    defaultIntensity: 1.1,
    defaultScale: 1.0,
    defaultGrain: 1.15,
    variants: [
      { id: 'colodion', index: 0, label: 'Colodión Plata', note: 'Plata metálica de alto contraste' },
      { id: 'cianotipo', index: 1, label: 'Cianotipo Azul', note: 'Ferroprusiato azul prusiano' },
      { id: 'albumina', index: 2, label: 'Albúmina Sepia', note: 'Papel salado cálido oxidado' },
    ],
  },
  {
    year: 1910,
    shortLabel: '1910',
    label: '1910s',
    title: 'Cine Mudo & Iris',
    medium: '35MM MANIVELA',
    eraGroup: 'origen',
    description: 'Parpadeo de obturador a 16 cuadros, viñeta de iris mecánico y tintes de cine silente.',
    storyPrompt: 'Rollo silente · Acto I',
    defaultIntensity: 1.05,
    defaultScale: 1.0,
    defaultGrain: 1.2,
    variants: [
      { id: 'nitrato', index: 0, label: 'Nitrato Puro', note: 'Monocromo con parpadeo de manivela' },
      { id: 'ambar', index: 1, label: 'Tinte Ámbar', note: 'Baño dorado de escena interior' },
      { id: 'noche', index: 2, label: 'Noche Azul', note: 'Tinte cobalto de secuencia nocturna' },
    ],
  },
  {
    year: 1920,
    shortLabel: '1920',
    label: '1920s',
    title: 'Expresionismo & Halo',
    medium: 'ORTO SILENTE',
    eraGroup: 'origen',
    description: 'Sombras arquitectónicas profundas, halo luminoso en altas luces y dramatismo silente.',
    storyPrompt: 'Luz y sombra · 1927',
    defaultIntensity: 1.1,
    defaultScale: 1.0,
    defaultGrain: 1.1,
    variants: [
      { id: 'metropolis', index: 0, label: 'Metrópolis', note: 'Contraste geométrico y halo plateado' },
      { id: 'iris', index: 1, label: 'Viñeta Iris', note: 'Cierre circular dramático de lente' },
      { id: 'suave', index: 2, label: 'Plata Suave', note: 'Difusión romántica en altas luces' },
    ],
  },
  {
    year: 1930,
    shortLabel: '1930',
    label: '1930s',
    title: 'Celuloide & Sepia',
    medium: '35MM NITRATO',
    eraGroup: 'analogico',
    description: 'Emulsión cálida en sepia, rayas verticales de proyector y temblor mecánico de compuerta.',
    storyPrompt: 'Archivo de celuloide',
    defaultIntensity: 1.05,
    defaultScale: 1.0,
    defaultGrain: 1.15,
    variants: [
      { id: 'sepia', index: 0, label: 'Estudio Sepia', note: 'Sepia clásico equilibrado' },
      { id: 'gastado', index: 1, label: 'Rollo Gastado', note: 'Rayas intensas y saltos de compuerta' },
      { id: 'dorado', index: 2, label: 'Dorado Suave', note: 'Calidez de proyección de archivo' },
    ],
  },
  {
    year: 1940,
    shortLabel: '1940',
    label: '1940s',
    title: 'Noir Monocromo',
    medium: 'ORTOCROMÁTICO B&N',
    eraGroup: 'analogico',
    description: 'Alto contraste dramático en blanco y negro, sombras densas y grano grueso de haluro de plata.',
    storyPrompt: 'Capítulo Nocturno · Noir',
    defaultIntensity: 1.1,
    defaultScale: 1.0,
    defaultGrain: 1.25,
    variants: [
      { id: 'noir', index: 0, label: 'Sombras Noir', note: 'Negros profundos de cine negro' },
      { id: 'prensa', index: 1, label: 'Prensa 400', note: 'Grano periodístico de alto ISO' },
      { id: 'calida', index: 2, label: 'Plata Cálida', note: 'Blanco y negro con tinte selenio' },
    ],
  },
  {
    year: 1950,
    shortLabel: '1950',
    label: '1950s',
    title: 'Technicolor 2-Strip',
    medium: 'TRANSFERENCIA DYE',
    eraGroup: 'analogico',
    description: 'Separación cromática roja y cian de cine clásico con saturación rica y halación cálida.',
    storyPrompt: 'Estreno en Technicolor',
    defaultIntensity: 1.0,
    defaultScale: 1.0,
    defaultGrain: 0.85,
    variants: [
      { id: 'clasico', index: 0, label: 'Cine Clásico', note: 'Equilibrio rojo-esmeralda 1954' },
      { id: 'bicolor', index: 1, label: 'Rojo & Cian', note: 'Matriz bicromática saturada' },
      { id: 'pastel', index: 2, label: 'Pastel Retro', note: 'Postales cálidas de mediados de siglo' },
    ],
  },
  {
    year: 1960,
    shortLabel: '1960',
    label: '1960s',
    title: 'Kodachrome Cálido',
    medium: 'DIAPOSITIVA 35MM',
    eraGroup: 'analogico',
    description: 'Altas luces doradas, sombras levantadas y pátina fotoquímica de diapositiva analógica.',
    storyPrompt: 'Diapositiva de memoria',
    defaultIntensity: 1.0,
    defaultScale: 1.0,
    defaultGrain: 0.8,
    variants: [
      { id: 'koda64', index: 0, label: 'Kodachrome 64', note: 'Rojos ricos y dorados limpios' },
      { id: 'ekta', index: 1, label: 'Ektachrome', note: 'Matices fríos en sombra y sol cálido' },
      { id: 'instant', index: 2, label: 'Instantánea 68', note: 'Negros cremosos y viñeta nostálgica' },
    ],
  },
  {
    year: 1970,
    shortLabel: '1970',
    label: '1970s',
    title: 'Super 8 & Fugas',
    medium: 'PROCESO CRUZADO',
    eraGroup: 'analogico',
    description: 'Fugas de luz ámbar orgánicas en los bordes, contraste analógico y deriva cromática cálida.',
    storyPrompt: 'Carrete Super 8mm',
    defaultIntensity: 1.05,
    defaultScale: 1.1,
    defaultGrain: 0.9,
    variants: [
      { id: 'fuga', index: 0, label: 'Fuga Ámbar', note: 'Entrada solar orgánica en el carrete' },
      { id: 'psico', index: 1, label: 'Psicodélico', note: 'Saturación extrema y reflejos cálidos' },
      { id: '16mm', index: 2, label: 'Documental 16mm', note: 'Grano orgánico de calle y tonos tierra' },
    ],
  },
  {
    year: 1980,
    shortLabel: '1980',
    label: '1980s',
    title: 'VHS & Tracking CRT',
    medium: 'CINTA NTSC',
    eraGroup: 'analogico',
    description: 'Líneas de escaneo CRT, desplazamiento de tracking y separación de croma analógica.',
    storyPrompt: 'Cinta VHS · REC SP',
    defaultIntensity: 1.0,
    defaultScale: 1.0,
    defaultGrain: 1.0,
    variants: [
      { id: 'vhs', index: 0, label: 'VHS Doméstico', note: 'Tracking analógico y croma suave' },
      { id: 'crt', index: 1, label: 'Monitor CRT', note: 'Fósforo marcado y líneas finas' },
      { id: 'synth', index: 2, label: 'Noche 1984', note: 'Sombras azul cobalto y neón ámbar' },
    ],
  },
  {
    year: 1990,
    shortLabel: '1990',
    label: '1990s',
    title: 'Camcorder & Mosh',
    medium: 'MINIDV DIGITAL',
    eraGroup: 'digital',
    description: 'Artefactos de sincronía horizontal, cuantización de bloques y desfase de videocámara.',
    storyPrompt: 'Grabación MiniDV · 1997',
    defaultIntensity: 0.95,
    defaultScale: 1.0,
    defaultGrain: 0.75,
    variants: [
      { id: 'hi8', index: 0, label: 'Handycam Hi8', note: 'Color crudo con bordes de video' },
      { id: 'mosh', index: 1, label: 'Data Mosh', note: 'Cortes de sincronía y macrobloques' },
      { id: 'web99', index: 2, label: 'Ciber 1999', note: 'Tinte fósforo verde-cian y compresión' },
    ],
  },
  {
    year: 2000,
    shortLabel: '2000',
    label: '2000s',
    title: 'Y2K Bloom Digital',
    medium: 'SENSOR CCD 2.1MP',
    eraGroup: 'digital',
    description: 'Resplandor suave en altas luces, nitidez digital temprana y brillo frío de sensor CCD.',
    storyPrompt: 'Memoria CCD · 2003',
    defaultIntensity: 1.0,
    defaultScale: 1.1,
    defaultGrain: 0.5,
    variants: [
      { id: 'ccd', index: 0, label: 'CCD 2003', note: 'Bloom brillante y contraste limpio' },
      { id: 'flash', index: 1, label: 'Flash Directo', note: 'Altas luces intensas de cámara compacta' },
      { id: 'dvcian', index: 2, label: 'DV Cian', note: 'Temperatura fría estilo videoclip Y2K' },
    ],
  },
  {
    year: 2010,
    shortLabel: '2010',
    label: '2010s',
    title: 'Teal & Orange',
    medium: 'CINE DIGITAL LUT',
    eraGroup: 'digital',
    description: 'Gradación cinematográfica de sombras verde-azuladas, pieles cálidas y negros mate elevados.',
    storyPrompt: 'Edición Cinema · 2016',
    defaultIntensity: 1.0,
    defaultScale: 1.0,
    defaultGrain: 0.45,
    variants: [
      { id: 'block', index: 0, label: 'Blockbuster', note: 'Contraste cinematográfico Teal & Orange' },
      { id: 'indie', index: 1, label: 'Indie Mate', note: 'Negros lavados y luz suave editorial' },
      { id: 'anam', index: 2, label: 'Anamórfico', note: 'Destello horizontal sutil en brillos' },
    ],
  },
  {
    year: 2020,
    shortLabel: '2020',
    label: '2020s',
    title: 'SGX.Story Prístino',
    medium: 'PERFIL SGX 4K',
    eraGroup: 'digital',
    description: 'Firma óptica de Spatialgineers: nitidez micro-cromática, sombras #32527B y acento dorado.',
    storyPrompt: 'Toda innovación necesita una historia.',
    defaultIntensity: 1.0,
    defaultScale: 1.0,
    defaultGrain: 0.35,
    variants: [
      { id: 'story', index: 0, label: 'SGX.Story', note: 'Azul metálico en sombras y oro SGX' },
      { id: 'stage', index: 1, label: 'SGX.Stage Oro', note: 'Altas luces doradas de escenario' },
      { id: 'showcase', index: 2, label: 'SGX.Showcase', note: 'Telemetría cian limpia de exhibición' },
    ],
  },
  {
    year: 2030,
    shortLabel: '2030',
    label: '2030s',
    title: 'Óptica Holográfica',
    medium: 'CAMPO DE LUZ',
    eraGroup: 'espacial',
    description: 'Refracción espectral holográfica, interferencia fina de ondas y profundidad fotónica.',
    storyPrompt: 'Proyección de campo de luz · 2034',
    defaultIntensity: 1.05,
    defaultScale: 1.0,
    defaultGrain: 0.15,
    variants: [
      { id: 'prisma', index: 0, label: 'Prisma Holo', note: 'Dispersión espectral cian y oro' },
      { id: 'cuantico', index: 1, label: 'Térmico Cuántico', note: 'Mapa de energía azul-oro-cian' },
      { id: 'difrac', index: 2, label: 'Difracción SGX', note: 'Bandas de interferencia holográfica' },
    ],
  },
  {
    year: 2050,
    shortLabel: '2050',
    label: '2050s',
    title: 'Neural AR',
    medium: 'ÓPTICA ESPACIAL',
    eraGroup: 'espacial',
    description: 'Detección de bordes Sobel en amarillo SGX, matriz de puntos en cian y barrido espacial.',
    storyPrompt: 'Capa Espacial · 2054',
    defaultIntensity: 1.05,
    defaultScale: 1.0,
    defaultGrain: 0.2,
    variants: [
      { id: 'gold', index: 0, label: 'Borde Dorado', note: 'Contornos Sobel #FDCC0D y retícula azul' },
      { id: 'cyan', index: 1, label: 'Malla Cian', note: 'Telemetría #00DDFF de alta densidad' },
      { id: 'lidar', index: 2, label: 'Escáner Lidar', note: 'Barrido topográfico espacial continuo' },
    ],
  },
  {
    year: 2090,
    shortLabel: '2090',
    label: '2090s',
    title: 'Archivo Sintético',
    medium: 'MEMORIA ESPACIAL',
    eraGroup: 'espacial',
    description: 'Reconstrucción neuronal de memoria visual: retícula hexagonal fina y eco temporal luminoso.',
    storyPrompt: 'Memoria del Siglo XXII',
    defaultIntensity: 1.1,
    defaultScale: 1.0,
    defaultGrain: 0.15,
    variants: [
      { id: 'neural', index: 0, label: 'Trama Neural', note: 'Reconstrucción de bordes y nodos cian' },
      { id: 'ecos', index: 1, label: 'Ecos Temporales', note: 'Doble exposición cromática desplazada' },
      { id: 'singul', index: 2, label: 'Singularidad', note: 'Silueta dorada sobre vacío técnico' },
    ],
  },
];

export const ERA_YEARS = DECADES.map((d) => d.year);

export function getDecadeIndexByYear(year: number): number {
  let bestIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < DECADES.length; i++) {
    const diff = Math.abs(DECADES[i].year - year);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function getDecadeByYear(year: number): DecadePreset {
  return DECADES[getDecadeIndexByYear(year)];
}
