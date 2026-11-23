import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  BookOpen,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Columns2,
  Download,
  Eye,
  EyeOff,
  Film,
  Grid2x2,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Minus,
  Moon,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Rows2,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Square,
  Stamp,
  Sun,
  SwitchCamera,
  Upload,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import {
  DECADES,
  FRAME_ASPECTS,
  FrameAspectId,
  SPLIT_LAYOUTS,
  SplitLayout,
  getDecadeIndexByYear,
} from './data/decades';
import {
  BUILTIN_MASKS,
  SGX_PILLAR_MASKS,
  SgxPillarMask,
  findPillarMaskById,
  getBuiltinMaskDataUrl,
} from './data/masks';
import { SGX_TINT_SWATCHES, STUDIO_PLATES } from './data/plates';
import {
  CameraFacing,
  SourceMode,
  TemporalCanvas,
  TemporalCanvasHandle,
  TriptychEraSlot,
} from './engine/TemporalCanvas';
import { temporalAudio } from './engine/temporalAudio';
import { SgxBrandMark } from './components/SgxBrandMark';
import { CapturedItem, CaptureModal } from './components/CaptureModal';
import { EraPickerModal } from './components/EraPickerModal';

type SheetMode = 'closed' | 'controls' | 'gallery';
type ControlTab = 'split' | 'optics' | 'tint' | 'story' | 'source';
type ThemeMode = 'dark' | 'light';

interface ZoneConfig {
  eraIndex: number;
  variantIndex: 0 | 1 | 2;
}

const SPLIT_MODE_NUM: Record<SplitLayout, number> = {
  single: 0,
  ab: 1,
  dual: 2,
  trio: 3,
  quad: 4,
  dualH: 5,
  hex: 6,
  grid9: 7,
  mask: 8,
};

const SPLIT_CYCLE_ORDER: SplitLayout[] = [
  'single',
  'dual',
  'dualH',
  'trio',
  'quad',
  'hex',
  'grid9',
  'mask',
  'ab',
];

const INITIAL_ZONE_YEARS = [2020, 1980, 1930, 2050, 1960, 1990, 1890, 2030, 1940];

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function App() {
  const canvasRef = useRef<TemporalCanvasHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const maskInputRef = useRef<HTMLInputElement | null>(null);
  const eraButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const toastTimerRef = useRef<number | null>(null);

  // Gesture tracking refs for intuitive mobile swipe, double-tap, mask drag & 2-finger pinch-to-zoom
  const pointerStartRef = useRef<{
    x: number;
    y: number;
    time: number;
    maskStartX: number;
    maskStartY: number;
    moved: boolean;
  } | null>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{ dist: number; scale: number } | null>(null);
  const lastTapTimeRef = useRef<number>(0);

  const [sourceMode, setSourceMode] = useState<SourceMode>('demo');
  const [plateId, setPlateId] = useState<string>(STUDIO_PLATES[0].id);
  const [uploadedMedia, setUploadedMedia] = useState<{
    url: string;
    kind: 'image' | 'video';
    name: string;
  } | null>(null);
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>('user');
  const [cameraRetryNonce, setCameraRetryNonce] = useState(0);
  const [cameraLive, setCameraLive] = useState(false);

  // Multi-Era Zone State (9 independent time slots for 1x, A/B, 2x, 2xH, 3x, 4x, 6x, 9x & Alpha Mask!)
  const [splitLayout, setSplitLayout] = useState<SplitLayout>('single');
  const [activeZone, setActiveZone] = useState<number>(0);
  const [zones, setZones] = useState<ZoneConfig[]>(() =>
    INITIAL_ZONE_YEARS.map((y) => ({ eraIndex: getDecadeIndexByYear(y), variantIndex: 0 }))
  );

  const activeZoneConfig = zones[activeZone] ?? zones[0];
  const eraIndex = activeZoneConfig.eraIndex;
  const variantIndex = activeZoneConfig.variantIndex;

  // Transparent PNG/SVG Alpha Mask State (defaults to official MCP SGX.Story pillar emblem)
  const [maskCategory, setMaskCategory] = useState<'pillars' | 'shapes'>('pillars');
  const [maskPresetId, setMaskPresetId] = useState<string>(SGX_PILLAR_MASKS[0].id);
  const [customMask, setCustomMask] = useState<{ url: string; name: string } | null>(null);
  const [maskScale, setMaskScale] = useState<number>(0.85);
  const [maskOffsetX, setMaskOffsetX] = useState<number>(0);
  const [maskOffsetY, setMaskOffsetY] = useState<number>(0);
  const [maskInvert, setMaskInvert] = useState<boolean>(false);
  const [maskFeather, setMaskFeather] = useState<number>(0.0);
  const [maskEdge, setMaskEdge] = useState<boolean>(true);

  const activePillarMask = useMemo(
    () => (customMask ? null : findPillarMaskById(maskPresetId)),
    [customMask, maskPresetId]
  );

  const activeMaskEdgeColor = activePillarMask ? activePillarMask.color : '#FDCC0D';

  const activeMaskSrc = useMemo(() => {
    if (customMask) return customMask.url;
    return getBuiltinMaskDataUrl(maskPresetId);
  }, [customMask, maskPresetId]);

  const [displayYear, setDisplayYear] = useState<number>(2020);
  const displayYearRef = useRef<number>(2020);

  // GPU Warp trigger state
  const [warpNonce, setWarpNonce] = useState<number>(0);
  const [warpDirection, setWarpDirection] = useState<number>(1);
  const [isAutoVoyage, setIsAutoVoyage] = useState<boolean>(false);

  // Optical & Story Controls
  const [intensity, setIntensity] = useState<number>(1.0);
  const [scale, setScale] = useState<number>(1.0);
  const [grain, setGrain] = useState<number>(0.35);
  const [tintHex, setTintHex] = useState<string>('#FDCC0D');
  const [tintPower, setTintPower] = useState<number>(0.0);
  const [frameAspectId, setFrameAspectId] = useState<FrameAspectId>('full');
  const [chapterTitle, setChapterTitle] = useState<string>('');
  const [stampEnabled, setStampEnabled] = useState<boolean>(true);

  // Compare modes: draggable splitX/splitY + hold-to-peek original
  const [splitX, setSplitX] = useState<number>(0.5);
  const [splitY, setSplitY] = useState<number>(0.5);
  const [isDraggingSplit, setIsDraggingSplit] = useState<boolean>(false);
  const [peekingOriginal, setPeekingOriginal] = useState<boolean>(false);

  // Clean Progressive-Disclosure UI state
  const [sheetMode, setSheetMode] = useState<SheetMode>('closed');
  const [controlTab, setControlTab] = useState<ControlTab>('split');
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [eraPickerOpen, setEraPickerOpen] = useState<boolean>(false);
  const [hudHidden, setHudHidden] = useState<boolean>(false);
  const [hudToast, setHudToast] = useState<string | null>(null);

  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const [liteMode, setLiteMode] = useState<boolean>(false);
  const [theme, setTheme] = useState<ThemeMode>('dark');

  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordSeconds, setRecordSeconds] = useState<number>(0);
  const [shutterFlash, setShutterFlash] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const [captures, setCaptures] = useState<CapturedItem[]>([]);
  const [previewItem, setPreviewItem] = useState<CapturedItem | null>(null);

  const [reducedMotion, setReducedMotion] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );

  const activeDecade = DECADES[eraIndex] ?? DECADES[0];
  const activeVariant = activeDecade.variants[variantIndex] ?? activeDecade.variants[0];
  const activeSplitOption = useMemo(
    () => SPLIT_LAYOUTS.find((s) => s.id === splitLayout) ?? SPLIT_LAYOUTS[0],
    [splitLayout]
  );
  const isMultiEraSplit = splitLayout !== 'single' && splitLayout !== 'ab';
  const visibleZoneCount = activeSplitOption.zones;

  const activePlate = useMemo(
    () => STUDIO_PLATES.find((p) => p.id === plateId) ?? STUDIO_PLATES[0],
    [plateId]
  );
  const activeFrame = useMemo(
    () => FRAME_ASPECTS.find((f) => f.id === frameAspectId) ?? FRAME_ASPECTS[0],
    [frameAspectId]
  );

  const showToast = useCallback((msg: string) => {
    setHudToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setHudToast(null);
    }, 1500);
  }, []);

  const handleHideAllUi = useCallback(() => {
    setHudHidden(true);
    setSheetMode('closed');
    setMenuOpen(false);
    showToast('UI oculta · Toca la pantalla para mostrar');
  }, [showToast]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      temporalAudio.dispose();
    };
  }, []);

  // Auto-center the active era button in the horizontal touch wheel
  useEffect(() => {
    const btn = eraButtonRefs.current[eraIndex];
    if (btn) {
      btn.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [eraIndex, reducedMotion]);

  // Rolling mechanical year odometer synchronized with era jumps
  useEffect(() => {
    const targetYear = activeDecade.year;
    if (reducedMotion || displayYearRef.current === targetYear) {
      displayYearRef.current = targetYear;
      setDisplayYear(targetYear);
      return;
    }

    const startYear = displayYearRef.current;
    const startMs = performance.now();
    const durationMs = 340;
    let rafId = 0;

    const step = (now: number) => {
      const t = Math.min(1, (now - startMs) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = Math.round(startYear + (targetYear - startYear) * eased);
      displayYearRef.current = val;
      setDisplayYear(val);
      if (t < 1) {
        rafId = requestAnimationFrame(step);
      }
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [activeDecade.year, reducedMotion]);

  useEffect(() => {
    if (!isRecording) {
      setRecordSeconds(0);
      return;
    }
    const id = window.setInterval(() => {
      setRecordSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [isRecording]);

  const updateZoneAt = useCallback(
    (zoneIdx: number, nextEraIdx: number, nextVar: 0 | 1 | 2) => {
      setZones((prev) => {
        const copy = [...prev];
        copy[zoneIdx] = { eraIndex: nextEraIdx, variantIndex: nextVar };
        return copy;
      });
    },
    []
  );

  const getZoneShortName = useCallback(
    (zIdx: number) => {
      if (splitLayout === 'mask') return zIdx === 0 ? 'DENTRO' : 'FUERA';
      return `Z${zIdx + 1}`;
    },
    [splitLayout]
  );

  const jumpToEraIndex = useCallback(
    (nextIdx: number, nextVariant?: 0 | 1 | 2, toastFeedback = false) => {
      const clamped = Math.max(0, Math.min(DECADES.length - 1, nextIdx));
      const prevYear = DECADES[eraIndex].year;
      const target = DECADES[clamped];
      const chosenVariant = nextVariant ?? 0;

      if (clamped !== eraIndex) {
        setWarpDirection(target.year >= prevYear ? 1 : -1);
        setWarpNonce((n) => n + 1);
        temporalAudio.playTimeJump(prevYear, target.year);
      } else {
        temporalAudio.playDetent(640);
      }

      updateZoneAt(activeZone, clamped, chosenVariant);
      if (!isMultiEraSplit) {
        setIntensity(target.defaultIntensity);
        setScale(target.defaultScale);
        setGrain(target.defaultGrain);
      }

      if (toastFeedback) {
        const prefix = isMultiEraSplit ? `${getZoneShortName(activeZone)} · ` : '';
        showToast(`${prefix}${target.label} · ${target.variants[chosenVariant].label}`);
      }
    },
    [eraIndex, activeZone, isMultiEraSplit, updateZoneAt, getZoneShortName, showToast]
  );

  const handleSetVariant = useCallback(
    (vIdx: 0 | 1 | 2, withToast = false) => {
      updateZoneAt(activeZone, eraIndex, vIdx);
      temporalAudio.playDetent(560 + vIdx * 90);
      if (withToast) {
        const prefix = isMultiEraSplit ? `${getZoneShortName(activeZone)} · ` : '';
        showToast(`${prefix}${activeDecade.label} · ${activeDecade.variants[vIdx].label}`);
      }
    },
    [activeZone, eraIndex, activeDecade, isMultiEraSplit, updateZoneAt, getZoneShortName, showToast]
  );

  const handleChangeSplitLayout = useCallback(
    (nextLayout: SplitLayout) => {
      setSplitLayout(nextLayout);
      const nextOpt = SPLIT_LAYOUTS.find((s) => s.id === nextLayout) ?? SPLIT_LAYOUTS[0];
      if (activeZone >= nextOpt.zones) {
        setActiveZone(0);
      }
      temporalAudio.playDetent(620);
      showToast(`División: ${nextOpt.label} (${nextOpt.shortLabel})`);
    },
    [activeZone, showToast]
  );

  const handleCycleSplitLayout = useCallback(() => {
    const idx = SPLIT_CYCLE_ORDER.indexOf(splitLayout);
    const next = SPLIT_CYCLE_ORDER[(idx + 1) % SPLIT_CYCLE_ORDER.length];
    handleChangeSplitLayout(next);
  }, [splitLayout, handleChangeSplitLayout]);

  const handleMaskFileSelected = useCallback(
    (file: File | null | undefined) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        setAlertMessage('Sube una imagen PNG, WebP o SVG con fondo transparente para usar como máscara.');
        return;
      }
      setAlertMessage(null);
      const url = URL.createObjectURL(file);
      setCustomMask((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url, name: file.name };
      });
      setMaskOffsetX(0);
      setMaskOffsetY(0);
      setMaskScale(0.85);
      setSplitLayout('mask');
      if (activeZone > 1) setActiveZone(0);
      showToast(`Máscara cargada: ${file.name.slice(0, 22)}`);
    },
    [activeZone, showToast]
  );

  const handleSelectPillarMask = useCallback(
    (pillar: SgxPillarMask, applyDualPreset = false) => {
      setCustomMask(null);
      setMaskCategory('pillars');
      setMaskPresetId(pillar.id);
      setMaskOffsetX(0);
      setMaskOffsetY(0);
      if (splitLayout !== 'mask') {
        setSplitLayout('mask');
        if (activeZone > 1) setActiveZone(0);
      }
      if (applyDualPreset) {
        const insideIdx = getDecadeIndexByYear(pillar.recommendedInsideYear);
        const outsideIdx = getDecadeIndexByYear(pillar.recommendedOutsideYear);
        setZones((prev) => {
          const copy = [...prev];
          copy[0] = { eraIndex: insideIdx, variantIndex: 0 };
          copy[1] = { eraIndex: outsideIdx, variantIndex: 0 };
          return copy;
        });
        setWarpDirection(1);
        setWarpNonce((n) => n + 1);
        temporalAudio.playTimeJump(pillar.recommendedOutsideYear, pillar.recommendedInsideYear);
        showToast(
          `${pillar.name} · ${pillar.recommendedInsideYear}s / ${pillar.recommendedOutsideYear}s`
        );
      } else {
        temporalAudio.playDetent(600);
        showToast(`${pillar.name} · ${pillar.guildRole}`);
      }
    },
    [splitLayout, activeZone, showToast]
  );

  const handleCyclePillarMask = useCallback(() => {
    const currIdx = activePillarMask
      ? SGX_PILLAR_MASKS.findIndex((p) => p.id === activePillarMask.id)
      : -1;
    const next = SGX_PILLAR_MASKS[(currIdx + 1) % SGX_PILLAR_MASKS.length];
    handleSelectPillarMask(next, false);
  }, [activePillarMask, handleSelectPillarMask]);

  // Automated Time-Travel Voyage mode
  useEffect(() => {
    if (!isAutoVoyage || isRecording) return;
    const id = window.setInterval(() => {
      setZones((prev) => {
        const curr = prev[activeZone].eraIndex;
        const next = (curr + 1) % DECADES.length;
        const fromYear = DECADES[curr].year;
        const toYear = DECADES[next].year;
        setWarpDirection(toYear >= fromYear ? 1 : -1);
        setWarpNonce((n) => n + 1);
        temporalAudio.playTimeJump(fromYear, toYear);
        if (!isMultiEraSplit) {
          setIntensity(DECADES[next].defaultIntensity);
          setScale(DECADES[next].defaultScale);
          setGrain(DECADES[next].defaultGrain);
        }
        const copy = [...prev];
        copy[activeZone] = { eraIndex: next, variantIndex: 0 };
        return copy;
      });
    }, 2800);
    return () => window.clearInterval(id);
  }, [isAutoVoyage, isRecording, activeZone, isMultiEraSplit]);

  const handleRandomizeAllZones = useCallback(
    (prefixToast = 'Mezcla') => {
      setIsAutoVoyage(false);
      const picked = new Set<number>();
      const nextZones: ZoneConfig[] = [];
      for (let i = 0; i < 9; i++) {
        let idx = Math.floor(Math.random() * DECADES.length);
        while (picked.has(idx)) {
          idx = (idx + 3) % DECADES.length;
        }
        picked.add(idx);
        nextZones.push({
          eraIndex: idx,
          variantIndex: Math.floor(Math.random() * 3) as 0 | 1 | 2,
        });
      }
      setWarpDirection(Math.random() > 0.5 ? 1 : -1);
      setWarpNonce((n) => n + 1);
      temporalAudio.playTimeJump(DECADES[eraIndex].year, DECADES[nextZones[0].eraIndex].year);
      setZones(nextZones);

      const summary =
        visibleZoneCount <= 4
          ? nextZones
              .slice(0, visibleZoneCount)
              .map((z) => DECADES[z.eraIndex].shortLabel)
              .join(' · ')
          : `${visibleZoneCount} eras nuevas`;
      showToast(`${prefixToast}: ${summary}`);
    },
    [eraIndex, visibleZoneCount, showToast]
  );

  const handleRandomJump = useCallback(() => {
    setIsAutoVoyage(false);
    if (isMultiEraSplit) {
      handleRandomizeAllZones('Salto Multi-Era');
      return;
    }
    let nextIdx = Math.floor(Math.random() * DECADES.length);
    if (nextIdx === eraIndex) {
      nextIdx = (nextIdx + 3) % DECADES.length;
    }
    const randVariant = Math.floor(Math.random() * 3) as 0 | 1 | 2;
    jumpToEraIndex(nextIdx, randVariant, true);
  }, [eraIndex, isMultiEraSplit, handleRandomizeAllZones, jumpToEraIndex]);

  const handleCycleVariant = useCallback(() => {
    const nextVar = ((variantIndex + 1) % 3) as 0 | 1 | 2;
    handleSetVariant(nextVar, true);
  }, [variantIndex, handleSetVariant]);

  const handleToggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      temporalAudio.setEnabled(next);
      showToast(next ? 'Sonido activado' : 'Sonido silenciado');
      return next;
    });
  }, [showToast]);

  const handleResetOptics = useCallback(() => {
    setIntensity(activeDecade.defaultIntensity);
    setScale(activeDecade.defaultScale);
    setGrain(activeDecade.defaultGrain);
    setTintPower(0.0);
    setTintHex('#FDCC0D');
    setFrameAspectId('full');
    temporalAudio.playDetent(440);
    showToast('Óptica restablecida');
  }, [activeDecade, showToast]);

  const handleDownloadItem = useCallback((item: CapturedItem) => {
    const a = document.createElement('a');
    a.href = item.url;
    a.download = item.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  const handleCapturePhoto = useCallback(() => {
    const insideLabel = DECADES[zones[0].eraIndex].shortLabel;
    const outsideLabel = DECADES[zones[1].eraIndex].shortLabel;
    const multiLabels =
      splitLayout === 'mask'
        ? `${insideLabel} / ${outsideLabel}`
        : isMultiEraSplit
        ? visibleZoneCount <= 4
          ? zones
              .slice(0, visibleZoneCount)
              .map((z) => DECADES[z.eraIndex].shortLabel)
              .join(' · ')
          : `MOSAICO ${visibleZoneCount}×`
        : activeDecade.label;

    const dataUrl = canvasRef.current?.capturePhoto({
      decadeLabel: multiLabels,
      title:
        splitLayout === 'mask'
          ? activePillarMask
            ? `${activePillarMask.name} · ${activePillarMask.guildRole}`
            : `Máscara Alfa · ${customMask ? customMask.name.replace(/\.[^.]+$/, '') : 'SGX'}`
          : isMultiEraSplit
          ? `Multi-Era ${activeSplitOption.label}`
          : activeDecade.title,
      variantLabel:
        splitLayout === 'mask'
          ? `Dentro ${insideLabel} · Fuera ${outsideLabel}`
          : isMultiEraSplit
          ? `${visibleZoneCount} Tiempos`
          : activeVariant.label,
      medium:
        splitLayout === 'mask'
          ? activePillarMask
            ? `PILAR ${activePillarMask.name.toUpperCase()}`
            : 'MÁSCARA ALFA PNG'
          : isMultiEraSplit
          ? `DIVISIÓN ${activeSplitOption.shortLabel}`
          : activeDecade.medium,
      chapterTitle: chapterTitle || activeDecade.storyPrompt,
      stampEnabled,
    });
    if (!dataUrl) {
      setAlertMessage('No se pudo capturar el cuadro actual.');
      return;
    }

    temporalAudio.playShutter();
    setShutterFlash(true);
    window.setTimeout(() => setShutterFlash(false), 180);

    const now = new Date();
    const item: CapturedItem = {
      id: `photo_${Date.now()}`,
      kind: 'photo',
      url: dataUrl,
      decadeLabel: multiLabels,
      title:
        splitLayout === 'mask'
          ? activePillarMask
            ? `${activePillarMask.name} · ${insideLabel} / ${outsideLabel}`
            : `Máscara Alfa · ${insideLabel} / ${outsideLabel}`
          : isMultiEraSplit
          ? `Multi-Era ${activeSplitOption.shortLabel} · ${multiLabels}`
          : `${activeDecade.title} · ${activeVariant.label}`,
      timestamp: now.toLocaleTimeString('es-PR', { hour12: false }),
      filename: `SGX_Story_${
        splitLayout === 'mask'
          ? activePillarMask
            ? `Pilar_${activePillarMask.pillarId}`
            : 'Mascara'
          : isMultiEraSplit
          ? `Multi${visibleZoneCount}x`
          : activeDecade.year
      }_${Date.now()}.jpg`,
    };
    setCaptures((prev) => [item, ...prev].slice(0, 24));
    handleDownloadItem(item);
    window.setTimeout(() => setPreviewItem(item), 150);
  }, [
    splitLayout,
    activePillarMask,
    customMask,
    isMultiEraSplit,
    zones,
    visibleZoneCount,
    activeDecade,
    activeSplitOption,
    activeVariant,
    chapterTitle,
    stampEnabled,
    handleDownloadItem,
  ]);

  const handleCaptureTriptych = useCallback(() => {
    const pastIdx = eraIndex >= 4 ? eraIndex - 4 : 0;
    const futureIdx = eraIndex <= DECADES.length - 4 ? eraIndex + 3 : DECADES.length - 1;
    const pastEra = DECADES[pastIdx];
    const futureEra = DECADES[futureIdx];

    const slots: [TriptychEraSlot, TriptychEraSlot, TriptychEraSlot] = [
      {
        year: pastEra.year,
        label: pastEra.label,
        title: pastEra.title,
        variant: 0,
        variantLabel: pastEra.variants[0].label,
      },
      {
        year: activeDecade.year,
        label: activeDecade.label,
        title: activeDecade.title,
        variant: variantIndex,
        variantLabel: activeVariant.label,
      },
      {
        year: futureEra.year,
        label: futureEra.label,
        title: futureEra.title,
        variant: 0,
        variantLabel: futureEra.variants[0].label,
      },
    ];

    const dataUrl = canvasRef.current?.captureTriptych(
      slots,
      chapterTitle || `${pastEra.label} → ${activeDecade.label} → ${futureEra.label}`
    );

    if (!dataUrl) {
      setAlertMessage('No se pudo generar el tríptico temporal.');
      return;
    }

    temporalAudio.playShutter();
    setShutterFlash(true);
    window.setTimeout(() => setShutterFlash(false), 180);

    const now = new Date();
    const item: CapturedItem = {
      id: `triptych_${Date.now()}`,
      kind: 'photo',
      url: dataUrl,
      decadeLabel: `${pastEra.shortLabel}·${activeDecade.shortLabel}·${futureEra.shortLabel}`,
      title: 'Tríptico Temporal SGX.Story',
      timestamp: now.toLocaleTimeString('es-PR', { hour12: false }),
      filename: `SGX_Story_Triptico_${pastEra.year}_${activeDecade.year}_${futureEra.year}.jpg`,
    };
    setCaptures((prev) => [item, ...prev].slice(0, 24));
    setSheetMode('closed');
    setMenuOpen(false);
    handleDownloadItem(item);
    window.setTimeout(() => setPreviewItem(item), 150);
  }, [eraIndex, activeDecade, variantIndex, activeVariant, chapterTitle, handleDownloadItem]);

  const handleToggleRecord = useCallback(() => {
    if (isRecording) {
      canvasRef.current?.stopRecording();
      setIsRecording(false);
      return;
    }

    setIsAutoVoyage(false);
    setSheetMode('closed');
    setMenuOpen(false);

    const started = canvasRef.current?.startRecording((blobUrl, mimeType) => {
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const now = new Date();
      const item: CapturedItem = {
        id: `video_${Date.now()}`,
        kind: 'video',
        url: blobUrl,
        decadeLabel: activeDecade.label,
        title: `${activeDecade.title} · ${activeVariant.label}`,
        timestamp: now.toLocaleTimeString('es-PR', { hour12: false }),
        filename: `SGX_Story_${activeDecade.year}_${Date.now()}.${ext}`,
      };
      setCaptures((prev) => [item, ...prev].slice(0, 24));
      handleDownloadItem(item);
      setPreviewItem(item);
    });

    if (started) {
      setAlertMessage(null);
      setIsRecording(true);
    } else {
      setAlertMessage('La grabación de video WebM/MP4 no está soportada en este navegador.');
    }
  }, [isRecording, activeDecade, activeVariant, handleDownloadItem]);

  const handleFileSelected = useCallback(
    (file: File | null | undefined) => {
      if (!file) return;
      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');
      if (!isVideo && !isImage) {
        setAlertMessage('Formato no compatible. Sube una imagen (JPG, PNG, WebP) o un video (MP4, WebM).');
        return;
      }
      setAlertMessage(null);
      const url = URL.createObjectURL(file);
      setUploadedMedia((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url, kind: isVideo ? 'video' : 'image', name: file.name };
      });
      setCameraLive(false);
      setSourceMode('upload');
      setSheetMode('closed');
      setMenuOpen(false);
      showToast('Archivo cargado');
    },
    [showToast]
  );

  const handleStartCamera = useCallback(() => {
    setAlertMessage(null);
    setSourceMode('camera');
    setCameraRetryNonce((n) => n + 1);
    setSheetMode('closed');
    setMenuOpen(false);
  }, []);

  const handleFlipCamera = useCallback(() => {
    setCameraFacing((prev) => (prev === 'user' ? 'environment' : 'user'));
    temporalAudio.playDetent(580);
  }, []);

  const handleCameraError = useCallback((message: string) => {
    setCameraLive(false);
    setAlertMessage(message);
    setSourceMode('demo');
  }, []);

  const handleCameraReady = useCallback(() => {
    setCameraLive(true);
    setAlertMessage(null);
    showToast('Cámara activa');
  }, [showToast]);

  const handleDeleteCapture = useCallback((id: string) => {
    setCaptures((prev) => {
      const target = prev.find((c) => c.id === id);
      if (target && target.kind === 'video') {
        URL.revokeObjectURL(target.url);
      }
      return prev.filter((c) => c.id !== id);
    });
    setPreviewItem((prev) => (prev?.id === id ? null : prev));
  }, []);

  const clampMaskScale = (val: number) => Math.max(0.15, Math.min(3.5, Math.round(val * 100) / 100));

  const handleAdjustMaskScale = useCallback(
    (delta: number) => {
      setMaskScale((prev) => {
        const next = clampMaskScale(prev + delta);
        return next;
      });
      temporalAudio.playDetent(delta > 0 ? 640 : 520);
    },
    []
  );

  // Direct Canvas Touch Controls:
  // - In MASK mode: 1-finger drag pans the mask; 2-finger pinch (or mouse wheel) resizes it
  // - In Grid/Slice modes: tap any cell to select its zone, swipe to change its era
  // - Double-tap anywhere rotates variant; single tap dismisses open panels or restores hidden UI
  const handleStagePointerDown = (e: React.PointerEvent) => {
    if (isDraggingSplit) return;
    if (splitLayout === 'mask') {
      e.currentTarget.setPointerCapture(e.pointerId);
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointersRef.current.size === 2) {
        const pts = Array.from(activePointersRef.current.values());
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        pinchStartRef.current = { dist: Math.max(dist, 12), scale: maskScale };
        if (pointerStartRef.current) {
          pointerStartRef.current.moved = true;
        }
        return;
      }
    }
    pointerStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: performance.now(),
      maskStartX: maskOffsetX,
      maskStartY: maskOffsetY,
      moved: false,
    };
  };

  const handleStagePointerMove = (e: React.PointerEvent) => {
    if (isDraggingSplit || splitLayout !== 'mask') return;

    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // 2-finger pinch-to-zoom for the alpha mask
    if (activePointersRef.current.size >= 2 && pinchStartRef.current) {
      const pts = Array.from(activePointersRef.current.values());
      const currDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const ratio = currDist / pinchStartRef.current.dist;
      setMaskScale(clampMaskScale(pinchStartRef.current.scale * ratio));
      if (pointerStartRef.current) pointerStartRef.current.moved = true;
      return;
    }

    const start = pointerStartRef.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      start.moved = true;
      const nx = start.maskStartX + dx / Math.max(window.innerWidth, 1);
      const ny = start.maskStartY - dy / Math.max(window.innerHeight, 1); // GLSL vUv.y goes upward
      setMaskOffsetX(Math.max(-0.48, Math.min(0.48, nx)));
      setMaskOffsetY(Math.max(-0.48, Math.min(0.48, ny)));
    }
  };

  const handleStagePointerUp = (e: React.PointerEvent) => {
    if (splitLayout === 'mask') {
      activePointersRef.current.delete(e.pointerId);
      if (activePointersRef.current.size < 2) {
        const wasPinching = pinchStartRef.current !== null;
        pinchStartRef.current = null;
        if (activePointersRef.current.size === 1) {
          const [remaining] = Array.from(activePointersRef.current.values());
          pointerStartRef.current = {
            x: remaining.x,
            y: remaining.y,
            time: performance.now(),
            maskStartX: maskOffsetX,
            maskStartY: maskOffsetY,
            moved: true,
          };
          return;
        }
        if (wasPinching) {
          pointerStartRef.current = null;
          return;
        }
      }
    }

    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start || isDraggingSplit) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const elapsed = performance.now() - start.time;

    if (splitLayout === 'mask' && start.moved) {
      return;
    }

    // Horizontal swipe -> travel across eras (when not dragging an alpha mask)
    if (
      splitLayout !== 'mask' &&
      Math.abs(dx) > 48 &&
      Math.abs(dx) > Math.abs(dy) * 1.4 &&
      !isRecording
    ) {
      setIsAutoVoyage(false);
      if (dx < 0) {
        jumpToEraIndex(eraIndex + 1, 0, true);
      } else {
        jumpToEraIndex(eraIndex - 1, 0, true);
      }
      return;
    }

    // Short tap
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && elapsed < 300) {
      if (menuOpen) {
        setMenuOpen(false);
        return;
      }
      if (sheetMode !== 'closed') {
        setSheetMode('closed');
        return;
      }
      if (hudHidden) {
        setHudHidden(false);
        return;
      }

      // In Multi-Era Grid/Slice modes, tapping inside any cell selects that zone immediately
      if (isMultiEraSplit && splitLayout !== 'mask') {
        const nx = e.clientX / Math.max(window.innerWidth, 1);
        const ny = e.clientY / Math.max(window.innerHeight, 1);
        let tappedZone = 0;
        if (splitLayout === 'dual') {
          tappedZone = nx < splitX ? 0 : 1;
        } else if (splitLayout === 'dualH') {
          tappedZone = ny < splitY ? 0 : 1;
        } else if (splitLayout === 'trio') {
          tappedZone = nx < 0.3333 ? 0 : nx < 0.6667 ? 1 : 2;
        } else if (splitLayout === 'quad') {
          const row = ny < 0.5 ? 0 : 1;
          const col = nx < 0.5 ? 0 : 1;
          tappedZone = row * 2 + col;
        } else if (splitLayout === 'hex') {
          const row = ny < 0.5 ? 0 : 1;
          const col = nx < 0.3333 ? 0 : nx < 0.6667 ? 1 : 2;
          tappedZone = row * 3 + col;
        } else if (splitLayout === 'grid9') {
          const row = ny < 0.3333 ? 0 : ny < 0.6667 ? 1 : 2;
          const col = nx < 0.3333 ? 0 : nx < 0.6667 ? 1 : 2;
          tappedZone = row * 3 + col;
        }
        if (tappedZone !== activeZone) {
          setActiveZone(tappedZone);
          temporalAudio.playDetent(600);
          const zEra = DECADES[zones[tappedZone].eraIndex];
          showToast(`Zona ${tappedZone + 1} · ${zEra.label}`);
          lastTapTimeRef.current = 0;
          return;
        }
      }

      const now = performance.now();
      if (now - lastTapTimeRef.current < 300 && !isRecording) {
        lastTapTimeRef.current = 0;
        handleCycleVariant();
      } else {
        lastTapTimeRef.current = now;
      }
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (previewItem || eraPickerOpen) return;

      if (e.key === 'h' || e.key === 'H') {
        if (hudHidden) {
          setHudHidden(false);
        } else {
          handleHideAllUi();
        }
      } else if (e.key === 'ArrowLeft' && !isRecording) {
        e.preventDefault();
        setIsAutoVoyage(false);
        jumpToEraIndex(eraIndex - 1, 0, true);
      } else if (e.key === 'ArrowRight' && !isRecording) {
        e.preventDefault();
        setIsAutoVoyage(false);
        jumpToEraIndex(eraIndex + 1, 0, true);
      } else if ((e.key === '1' || e.key === '2' || e.key === '3') && !isRecording) {
        const vIdx = (Number(e.key) - 1) as 0 | 1 | 2;
        handleSetVariant(vIdx, true);
      } else if (e.key === 'c' || e.key === 'C') {
        handleCycleSplitLayout();
      } else if ((e.key === 'r' || e.key === 'R') && !isRecording) {
        handleRandomJump();
      } else if (e.key === 'Escape') {
        if (hudHidden) {
          setHudHidden(false);
        }
        setSheetMode('closed');
        setMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    hudHidden,
    handleHideAllUi,
    previewItem,
    eraPickerOpen,
    isRecording,
    eraIndex,
    jumpToEraIndex,
    handleSetVariant,
    handleCycleSplitLayout,
    handleRandomJump,
  ]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setIsDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    handleFileSelected(file);
  };

  const updateSplitFromClientX = (clientX: number) => {
    const ratio = Math.min(0.92, Math.max(0.08, clientX / Math.max(window.innerWidth, 1)));
    setSplitX(ratio);
  };

  const updateSplitFromClientY = (clientY: number) => {
    const ratio = Math.min(0.84, Math.max(0.16, clientY / Math.max(window.innerHeight, 1)));
    setSplitY(ratio);
  };

  // Effective shader config: hold-to-peek Original overrides to full-screen unmodified source
  const shaderConfig = useMemo(
    () => ({
      decade: DECADES[zones[0].eraIndex].year,
      variant: zones[0].variantIndex,
      intensity,
      scale,
      grain,
      tintHex,
      tintPower,
      splitEnabled: peekingOriginal || splitLayout === 'ab',
      splitMode: peekingOriginal ? 1 : SPLIT_MODE_NUM[splitLayout],
      splitX: peekingOriginal ? 1.0 : splitX,
      splitY,
      zoneDecades: zones.slice(0, 9).map((z) => DECADES[z.eraIndex].year),
      zoneVariants: zones.slice(0, 9).map((z) => z.variantIndex),
      activeZone,
      maskScale,
      maskOffsetX,
      maskOffsetY,
      maskInvert,
      maskFeather,
      maskEdge,
      maskEdgeColorHex: activeMaskEdgeColor,
      liteMode,
      reducedMotion,
      frameRatio: activeFrame.ratio,
      warpNonce,
      warpDirection,
    }),
    [
      zones,
      intensity,
      scale,
      grain,
      tintHex,
      tintPower,
      peekingOriginal,
      splitLayout,
      splitX,
      splitY,
      activeZone,
      maskScale,
      maskOffsetX,
      maskOffsetY,
      maskInvert,
      maskFeather,
      maskEdge,
      activeMaskEdgeColor,
      liteMode,
      reducedMotion,
      activeFrame.ratio,
      warpNonce,
      warpDirection,
    ]
  );

  const latestCapture = captures[0] ?? null;

  return (
    <div
      className="relative w-screen h-dvh overflow-hidden sgx-stage"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          handleFileSelected(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <input
        ref={maskInputRef}
        type="file"
        accept="image/png,image/webp,image/svg+xml,image/*"
        className="hidden"
        onChange={(e) => {
          handleMaskFileSelected(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {/* Full-Viewport Three.js WebGL Temporal Engine */}
      <TemporalCanvas
        ref={canvasRef}
        sourceMode={sourceMode}
        plateSrc={activePlate.src}
        uploadedMedia={uploadedMedia}
        maskSrc={activeMaskSrc}
        cameraFacing={cameraFacing}
        cameraRetryNonce={cameraRetryNonce}
        config={shaderConfig}
        onCameraError={handleCameraError}
        onCameraReady={handleCameraReady}
      />

      {/* Direct On-Canvas Layer (Swipe eras / Drag & Pinch-Zoom Mask / Double-tap variants / Tap zones) */}
      <div
        className={`fixed inset-0 z-[5] ${
          splitLayout === 'mask' ? 'touch-none cursor-grab active:cursor-grabbing' : 'touch-pan-y'
        }`}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerUp}
        onPointerCancel={(e) => {
          activePointersRef.current.delete(e.pointerId);
          if (activePointersRef.current.size < 2) pinchStartRef.current = null;
          pointerStartRef.current = null;
        }}
        onWheel={(e) => {
          if (splitLayout !== 'mask') return;
          const factor = Math.exp(-e.deltaY * 0.0018);
          setMaskScale((prev) => clampMaskScale(prev * factor));
        }}
        aria-hidden="true"
      />

      {/* Official SGX Viewfinder Corner Brackets */}
      {!hudHidden && (
        <div
          className="pointer-events-none fixed inset-3 md:inset-5 z-10"
          aria-hidden="true"
        >
          <div className="absolute top-0 left-0 w-[16px] h-[16px] border-t-2 border-l-2 border-sgx-yellow opacity-80" />
          <div className="absolute top-0 right-0 w-[16px] h-[16px] border-t-2 border-r-2 border-sgx-yellow opacity-80" />
          <div className="absolute bottom-0 left-0 w-[16px] h-[16px] border-b-2 border-l-2 border-sgx-yellow opacity-80" />
          <div className="absolute bottom-0 right-0 w-[16px] h-[16px] border-b-2 border-r-2 border-sgx-yellow opacity-80" />
        </div>
      )}

      {/* Interactive Draggable Divider for A/B Original AND 2x Dual-Era Split */}
      {!hudHidden && (splitLayout === 'ab' || splitLayout === 'dual') && !peekingOriginal && (
        <div
          className="fixed inset-y-0 z-10 cursor-ew-resize touch-none"
          style={{ left: `${splitX * 100}%` }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            setIsDraggingSplit(true);
            updateSplitFromClientX(e.clientX);
          }}
          onPointerMove={(e) => {
            if (!isDraggingSplit) return;
            updateSplitFromClientX(e.clientX);
          }}
          onPointerUp={() => setIsDraggingSplit(false)}
          onPointerCancel={() => setIsDraggingSplit(false)}
          role="slider"
          aria-label="Divisor de comparación temporal"
          aria-valuemin={8}
          aria-valuemax={92}
          aria-valuenow={Math.round(splitX * 100)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setSplitX((x) => Math.max(0.08, x - 0.05));
            if (e.key === 'ArrowRight') setSplitX((x) => Math.min(0.92, x + 0.05));
          }}
        >
          <div className="absolute inset-y-0 -left-px w-[2px] bg-sgx-cyan shadow-[0_0_12px_rgba(0,221,255,0.65)]" />
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 sgx-cut w-11 h-11 flex items-center justify-center bg-[var(--panel-solid)] border-sgx-cyan">
            <Columns2 className="w-5 h-5 text-sgx-cyan" />
          </div>
          {splitLayout === 'ab' && (
            <>
              <div className="pointer-events-none absolute top-20 right-3 px-2 py-1 bg-black/85 border border-sgx-blue/80 font-hud text-[11px] uppercase tracking-widest text-white whitespace-nowrap">
                ORIGINAL
              </div>
              <div className="pointer-events-none absolute top-20 left-3 px-2 py-1 bg-black/85 border border-sgx-yellow/80 font-hud text-[11px] uppercase tracking-widest text-sgx-yellow whitespace-nowrap">
                {DECADES[zones[0].eraIndex].label}
              </div>
            </>
          )}
        </div>
      )}

      {/* Interactive Horizontal Draggable Divider for 2xH Split */}
      {!hudHidden && splitLayout === 'dualH' && !peekingOriginal && (
        <div
          className="fixed inset-x-0 z-10 cursor-ns-resize touch-none"
          style={{ top: `${splitY * 100}%` }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            setIsDraggingSplit(true);
            updateSplitFromClientY(e.clientY);
          }}
          onPointerMove={(e) => {
            if (!isDraggingSplit) return;
            updateSplitFromClientY(e.clientY);
          }}
          onPointerUp={() => setIsDraggingSplit(false)}
          onPointerCancel={() => setIsDraggingSplit(false)}
          role="slider"
          aria-label="Divisor horizontal entre Era Superior e Inferior"
          aria-valuemin={16}
          aria-valuemax={84}
          aria-valuenow={Math.round(splitY * 100)}
          tabIndex={0}
        >
          <div className="absolute inset-x-0 -top-px h-[2px] bg-sgx-cyan shadow-[0_0_12px_rgba(0,221,255,0.65)]" />
          <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 sgx-cut w-11 h-11 flex items-center justify-center bg-[var(--panel-solid)] border-sgx-cyan">
            <Rows2 className="w-5 h-5 text-sgx-cyan" />
          </div>
        </div>
      )}

      {/* Interactive Multi-Era Zone Badges (Tap any slice/cell or Inside/Outside chip to edit its era!) */}
      {!hudHidden && isMultiEraSplit && !peekingOriginal && (
        <div className="pointer-events-none fixed inset-0 z-10">
          {splitLayout === 'mask' && (
            <div className="pointer-events-auto absolute top-[84px] left-1/2 -translate-x-1/2 flex items-center gap-1.5 max-w-[calc(100vw-24px)] overflow-x-auto sgx-no-scrollbar">
              {activePillarMask && (
                <button
                  type="button"
                  onClick={handleCyclePillarMask}
                  title="Toca para rotar entre los 6 pilares SGX"
                  style={{
                    backgroundColor: activePillarMask.color,
                    borderColor: activePillarMask.color,
                    color: activePillarMask.darkTextOnAccent ? '#050505' : '#FFFFFF',
                  }}
                  className="min-h-[34px] px-2.5 py-1 border font-hud text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-opacity hover:opacity-90 whitespace-nowrap shrink-0"
                >
                  {activePillarMask.name}
                </button>
              )}
              {([0, 1] as const).map((zIdx) => {
                const zDec = DECADES[zones[zIdx].eraIndex];
                const isSel = activeZone === zIdx;
                return (
                  <button
                    key={zIdx}
                    type="button"
                    onClick={() => {
                      setActiveZone(zIdx);
                      temporalAudio.playDetent(600);
                    }}
                    className={`min-h-[34px] px-2.5 py-1 border font-hud text-[11px] uppercase tracking-wider cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                      isSel
                        ? 'bg-sgx-yellow text-sgx-black-base border-sgx-yellow font-bold'
                        : 'bg-black/80 text-white border-sgx-blue/80 hover:border-sgx-yellow'
                    }`}
                  >
                    {zIdx === 0 ? 'DENTRO' : 'FUERA'} · {zDec.shortLabel}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setMaskInvert((v) => !v);
                  temporalAudio.playDetent(640);
                }}
                title="Invertir Dentro / Fuera"
                aria-label="Invertir máscara"
                className={`min-h-[34px] min-w-[34px] px-2 border flex items-center justify-center cursor-pointer transition-colors shrink-0 ${
                  maskInvert
                    ? 'bg-sgx-cyan text-sgx-black-base border-sgx-cyan'
                    : 'bg-black/80 text-white border-sgx-blue/80 hover:border-sgx-cyan'
                }`}
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
              </button>
              <div className="flex items-center border border-sgx-blue/80 bg-black/80 shrink-0">
                <button
                  type="button"
                  onClick={() => handleAdjustMaskScale(-0.15)}
                  disabled={maskScale <= 0.16}
                  title="Achicar máscara (o pellizca con 2 dedos)"
                  aria-label="Achicar máscara"
                  className="min-h-[34px] min-w-[32px] px-1.5 flex items-center justify-center text-white hover:text-sgx-yellow cursor-pointer disabled:opacity-35"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMaskScale(0.85);
                    setMaskOffsetX(0);
                    setMaskOffsetY(0);
                    temporalAudio.playDetent(580);
                  }}
                  title="Toca para restablecer tamaño y posición"
                  className="min-h-[34px] px-1.5 font-mono text-[10px] text-sgx-cyan hover:text-sgx-yellow cursor-pointer tabular-nums"
                >
                  {Math.round(maskScale * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => handleAdjustMaskScale(0.15)}
                  disabled={maskScale >= 3.49}
                  title="Agrandar máscara (o pellizca con 2 dedos)"
                  aria-label="Agrandar máscara"
                  className="min-h-[34px] min-w-[32px] px-1.5 flex items-center justify-center text-white hover:text-sgx-yellow cursor-pointer disabled:opacity-35"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {splitLayout === 'dual' &&
            ([0, 1] as const).map((zIdx) => {
              const zDec = DECADES[zones[zIdx].eraIndex];
              const isSel = activeZone === zIdx;
              return (
                <button
                  key={zIdx}
                  type="button"
                  onClick={() => {
                    setActiveZone(zIdx);
                    temporalAudio.playDetent(600);
                  }}
                  style={{
                    left: zIdx === 0 ? `${Math.max(12, splitX * 50)}%` : `${Math.min(88, (splitX + 1) * 50)}%`,
                  }}
                  className={`pointer-events-auto absolute top-[88px] -translate-x-1/2 min-h-[34px] px-2.5 py-1 border font-hud text-[11px] uppercase tracking-wider cursor-pointer transition-colors whitespace-nowrap ${
                    isSel
                      ? 'bg-sgx-yellow text-sgx-black-base border-sgx-yellow font-bold'
                      : 'bg-black/80 text-white border-sgx-blue/80 hover:border-sgx-yellow'
                  }`}
                >
                  Z{zIdx + 1} · {zDec.label}
                </button>
              );
            })}

          {splitLayout === 'dualH' &&
            ([0, 1] as const).map((zIdx) => {
              const zDec = DECADES[zones[zIdx].eraIndex];
              const isSel = activeZone === zIdx;
              return (
                <button
                  key={zIdx}
                  type="button"
                  onClick={() => {
                    setActiveZone(zIdx);
                    temporalAudio.playDetent(600);
                  }}
                  style={{
                    top: zIdx === 0 ? '88px' : `calc(${splitY * 100}% + 12px)`,
                  }}
                  className={`pointer-events-auto absolute left-4 min-h-[34px] px-2.5 py-1 border font-hud text-[11px] uppercase tracking-wider cursor-pointer transition-colors whitespace-nowrap ${
                    isSel
                      ? 'bg-sgx-yellow text-sgx-black-base border-sgx-yellow font-bold'
                      : 'bg-black/80 text-white border-sgx-blue/80 hover:border-sgx-yellow'
                  }`}
                >
                  {zIdx === 0 ? 'SUP' : 'INF'} · {zDec.label}
                </button>
              );
            })}

          {splitLayout === 'trio' &&
            ([0, 1, 2] as const).map((zIdx) => {
              const zDec = DECADES[zones[zIdx].eraIndex];
              const isSel = activeZone === zIdx;
              const leftPct = zIdx === 0 ? '16.66%' : zIdx === 1 ? '50%' : '83.33%';
              return (
                <button
                  key={zIdx}
                  type="button"
                  onClick={() => {
                    setActiveZone(zIdx);
                    temporalAudio.playDetent(600);
                  }}
                  style={{ left: leftPct }}
                  className={`pointer-events-auto absolute top-[88px] -translate-x-1/2 min-h-[34px] px-2 py-1 border font-hud text-[11px] uppercase tracking-wider cursor-pointer transition-colors whitespace-nowrap ${
                    isSel
                      ? 'bg-sgx-yellow text-sgx-black-base border-sgx-yellow font-bold'
                      : 'bg-black/80 text-white border-sgx-blue/80 hover:border-sgx-yellow'
                  }`}
                >
                  Z{zIdx + 1} · {zDec.shortLabel}
                </button>
              );
            })}

          {splitLayout === 'quad' &&
            ([0, 1, 2, 3] as const).map((zIdx) => {
              const zDec = DECADES[zones[zIdx].eraIndex];
              const isSel = activeZone === zIdx;
              const posClass =
                zIdx === 0
                  ? 'top-[88px] left-4'
                  : zIdx === 1
                  ? 'top-[88px] right-4'
                  : zIdx === 2
                  ? 'top-[calc(50%+10px)] left-4'
                  : 'top-[calc(50%+10px)] right-4';
              return (
                <button
                  key={zIdx}
                  type="button"
                  onClick={() => {
                    setActiveZone(zIdx);
                    temporalAudio.playDetent(600);
                  }}
                  className={`pointer-events-auto absolute ${posClass} min-h-[34px] px-2.5 py-1 border font-hud text-[11px] uppercase tracking-wider cursor-pointer transition-colors whitespace-nowrap ${
                    isSel
                      ? 'bg-sgx-yellow text-sgx-black-base border-sgx-yellow font-bold'
                      : 'bg-black/80 text-white border-sgx-blue/80 hover:border-sgx-yellow'
                  }`}
                >
                  Z{zIdx + 1} · {zDec.label}
                </button>
              );
            })}

          {splitLayout === 'hex' &&
            ([0, 1, 2, 3, 4, 5] as const).map((zIdx) => {
              const zDec = DECADES[zones[zIdx].eraIndex];
              const isSel = activeZone === zIdx;
              const row = Math.floor(zIdx / 3);
              const col = zIdx % 3;
              const leftPct = col === 0 ? '16.66%' : col === 1 ? '50%' : '83.33%';
              const topPos = row === 0 ? '88px' : 'calc(50% + 10px)';
              return (
                <button
                  key={zIdx}
                  type="button"
                  onClick={() => {
                    setActiveZone(zIdx);
                    temporalAudio.playDetent(600);
                  }}
                  style={{ left: leftPct, top: topPos }}
                  className={`pointer-events-auto absolute -translate-x-1/2 min-h-[30px] px-2 py-0.5 border font-mono text-[10px] uppercase cursor-pointer transition-colors whitespace-nowrap ${
                    isSel
                      ? 'bg-sgx-yellow text-sgx-black-base border-sgx-yellow font-bold'
                      : 'bg-black/80 text-white border-sgx-blue/80 hover:border-sgx-yellow'
                  }`}
                >
                  Z{zIdx + 1}·{zDec.shortLabel}
                </button>
              );
            })}

          {splitLayout === 'grid9' &&
            ([0, 1, 2, 3, 4, 5, 6, 7, 8] as const).map((zIdx) => {
              const zDec = DECADES[zones[zIdx].eraIndex];
              const isSel = activeZone === zIdx;
              const row = Math.floor(zIdx / 3);
              const col = zIdx % 3;
              const leftPct = col === 0 ? '16.66%' : col === 1 ? '50%' : '83.33%';
              const topPos = row === 0 ? '86px' : row === 1 ? 'calc(33.33% + 8px)' : 'calc(66.66% + 6px)';
              return (
                <button
                  key={zIdx}
                  type="button"
                  onClick={() => {
                    setActiveZone(zIdx);
                    temporalAudio.playDetent(600);
                  }}
                  style={{ left: leftPct, top: topPos }}
                  className={`pointer-events-auto absolute -translate-x-1/2 min-h-[28px] px-1.5 py-0.5 border font-mono text-[10px] uppercase cursor-pointer transition-colors whitespace-nowrap ${
                    isSel
                      ? 'bg-sgx-yellow text-sgx-black-base border-sgx-yellow font-bold'
                      : 'bg-black/80 text-white border-sgx-blue/80 hover:border-sgx-yellow'
                  }`}
                >
                  {zIdx + 1}·{zDec.shortLabel}
                </button>
              );
            })}
        </div>
      )}

      {/* Brief Center Toast on Swipe / Double-Tap / Snap / Peek Original */}
      {(peekingOriginal || hudToast) && (
        <div
          className="pointer-events-none fixed top-20 left-1/2 -translate-x-1/2 z-30 sgx-cut px-4 py-1.5 bg-[var(--panel-solid)] border-sgx-yellow"
          role="status"
          aria-live="polite"
        >
          <span className="font-hud text-xs uppercase tracking-[0.1em] text-[var(--accent-text)] whitespace-nowrap">
            {peekingOriginal ? 'ORIGINAL SIN FILTRO' : hudToast}
          </span>
        </div>
      )}

      {/* Shutter Flash */}
      {shutterFlash && (
        <div
          className="pointer-events-none fixed inset-0 z-40 bg-white/80 transition-opacity duration-200"
          aria-hidden="true"
        />
      )}

      {/* Drag & Drop Media Overlay */}
      {isDragOver && (
        <div className="fixed inset-0 z-40 bg-black/80 flex items-center justify-center p-6 pointer-events-none">
          <div className="sgx-panel sgx-panel--solid px-8 py-6 text-center max-w-md">
            <Upload className="w-8 h-8 text-sgx-yellow mx-auto mb-3" />
            <p className="font-display text-lg font-bold uppercase tracking-wider text-sgx-yellow">
              Suelta tu Imagen o Video
            </p>
            <p className="text-sm text-[var(--ink-muted)] mt-1">
              El archivo se cargará al instante en el motor temporal de SGX.Story.
            </p>
          </div>
        </div>
      )}

      {/* =====================================================================
          CLEAN 1-ROW TOP BAR (Minimal height, zero viewport crowding!)
         ===================================================================== */}
      {!hudHidden && (
        <header className="fixed top-0 inset-x-0 z-20 sgx-scrim-top sgx-safe-top px-3 sm:px-5 pb-4 pointer-events-none">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
            {/* Left: SGX Brand Lockup */}
            <div className="pointer-events-auto flex items-center gap-2.5 min-w-0">
              <SgxBrandMark className="w-7 h-7 sm:w-8 sm:h-8 shrink-0" />
              <div className="hidden sm:flex flex-col leading-tight min-w-0">
                <span className="font-hud text-[11px] uppercase tracking-[0.1em] text-[var(--ink)] font-semibold whitespace-nowrap">
                  SGX.STORY
                </span>
                <span className="font-mono text-[10px] uppercase text-[var(--telemetry)] whitespace-nowrap">
                  {sourceMode === 'camera'
                    ? 'CÁMARA EN VIVO'
                    : sourceMode === 'upload'
                    ? 'ARCHIVO LOCAL'
                    : activePlate.label}
                </span>
              </div>
            </div>

            {/* Center: Interactive Rolling Year Odometer (Tap to open 16-Era Map!) */}
            <button
              type="button"
              disabled={isRecording}
              onClick={() => setEraPickerOpen(true)}
              className="pointer-events-auto flex flex-col items-center justify-center min-h-[44px] px-3 py-1 cursor-pointer group focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
              aria-label={`Era actual ${activeDecade.label} ${activeDecade.title}. Toca para abrir mapa de 16 eras.`}
            >
              {isRecording ? (
                <div className="flex items-center gap-2 px-3 py-1 bg-sgx-neon-orange text-sgx-black-base font-hud text-xs font-bold uppercase tracking-widest">
                  <span className="w-2 h-2 rounded-full bg-sgx-black-base" />
                  <span>REC · {formatTimer(recordSeconds)}</span>
                </div>
              ) : (
                <>
                  <div className="flex items-baseline gap-1.5">
                    {isMultiEraSplit && (
                      <span className="px-1.5 py-0.5 bg-sgx-yellow text-sgx-black-base font-mono text-[10px] font-bold">
                        {getZoneShortName(activeZone)}
                      </span>
                    )}
                    <span className="font-display font-black text-2xl sm:text-3xl leading-none tracking-tight tabular-nums text-[var(--accent-text)] group-hover:opacity-90">
                      {displayYear}s
                    </span>
                    <ChevronDown className="w-4 h-4 text-[var(--ink-muted)] group-hover:text-[var(--accent-text)]" />
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-hud uppercase tracking-[0.06em] text-[var(--ink)] max-w-[180px] sm:max-w-xs truncate">
                    <span className="truncate">{activeDecade.title}</span>
                    <span className="opacity-50" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-[var(--telemetry)] truncate">{activeVariant.label}</span>
                  </div>
                </>
              )}
            </button>

            {/* Right: Essential Quick Switches (Split/Mask Sheet, Finger-Snap, Sound & Menu) */}
            <div className="pointer-events-auto flex items-center gap-1.5 relative">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  if (sheetMode === 'controls' && controlTab === 'split') {
                    setSheetMode('closed');
                  } else {
                    setControlTab('split');
                    setSheetMode('controls');
                  }
                }}
                aria-expanded={sheetMode === 'controls' && controlTab === 'split'}
                aria-label={`División y máscaras: ${activeSplitOption.label}. Toca para abrir opciones.`}
                title="Dividir canvas (hasta 9 eras) o usar Máscara PNG transparente"
                className={`sgx-btn sgx-btn--story sgx-btn--sm !px-2.5 ${
                  splitLayout !== 'single' || (sheetMode === 'controls' && controlTab === 'split')
                    ? 'is-active'
                    : ''
                }`}
              >
                {splitLayout === 'mask' ? (
                  <Layers className="w-4 h-4" />
                ) : splitLayout === 'quad' || splitLayout === 'hex' || splitLayout === 'grid9' ? (
                  <Grid2x2 className="w-4 h-4" />
                ) : splitLayout === 'dualH' ? (
                  <Rows2 className="w-4 h-4" />
                ) : (
                  <Columns2 className="w-4 h-4" />
                )}
                <span className="font-mono text-[11px]">{activeSplitOption.shortLabel}</span>
              </button>

              <button
                type="button"
                onClick={handleHideAllUi}
                aria-label="Esconder todo el UI"
                title="Esconder todo el UI (Tecla H)"
                className="sgx-btn sgx-btn--story sgx-btn--sm !px-2.5"
              >
                <EyeOff className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleToggleSound}
                aria-pressed={soundEnabled}
                aria-label={soundEnabled ? 'Silenciar sonido' : 'Activar sonido'}
                className={`hidden sm:inline-flex sgx-btn sgx-btn--story sgx-btn--sm !px-2.5 ${soundEnabled ? 'is-active' : ''}`}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-label="Más opciones"
                className={`sgx-btn sgx-btn--story sgx-btn--sm !px-2.5 ${menuOpen ? 'is-active' : ''}`}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {/* Quick Overflow Menu Popover */}
              {menuOpen && (
                <div
                  className="absolute right-0 top-[calc(100%+8px)] w-64 sgx-panel sgx-panel--solid p-2.5 flex flex-col gap-1.5 shadow-2xl z-40"
                  role="menu"
                >
                  {/* Direct 9-Layout Multi-Era & Alpha Mask Picker */}
                  <div className="px-1 pt-0.5 pb-1">
                    <span className="block font-hud text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)] mb-1.5">
                      Dividir Canvas / Máscara Alfa
                    </span>
                    <div className="grid grid-cols-3 gap-1">
                      {SPLIT_LAYOUTS.map((opt) => {
                        const active = opt.id === splitLayout;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              handleChangeSplitLayout(opt.id);
                              setMenuOpen(false);
                              if (opt.id === 'mask') {
                                setControlTab('split');
                                setSheetMode('controls');
                              }
                            }}
                            className={`min-h-[34px] font-mono text-[11px] border transition-colors cursor-pointer ${
                              active
                                ? 'bg-sgx-yellow text-sgx-black-base border-sgx-yellow font-bold'
                                : 'border-[var(--panel-line)] text-[var(--ink)] hover:border-sgx-yellow'
                            }`}
                          >
                            {opt.shortLabel}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="sgx-hud-rule" />

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      handleToggleSound();
                      setMenuOpen(false);
                    }}
                    className="sm:hidden w-full min-h-[42px] px-2.5 flex items-center justify-between text-xs font-hud uppercase tracking-wider hover:bg-sgx-yellow/15 cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5">
                      {soundEnabled ? (
                        <Volume2 className="w-4 h-4 text-[var(--accent-text)]" />
                      ) : (
                        <VolumeX className="w-4 h-4 text-[var(--telemetry)]" />
                      )}
                      Sonido Temporal
                    </span>
                    <span className="sgx-readout text-[11px]">{soundEnabled ? 'ON' : 'OFF'}</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    disabled={isRecording}
                    onClick={() => {
                      setIsAutoVoyage((v) => !v);
                      setMenuOpen(false);
                    }}
                    className="w-full min-h-[42px] px-2.5 flex items-center justify-between text-xs font-hud uppercase tracking-wider hover:bg-sgx-yellow/15 cursor-pointer disabled:opacity-40"
                  >
                    <span className="flex items-center gap-2.5">
                      {isAutoVoyage ? (
                        <Pause className="w-4 h-4 text-[var(--accent-text)]" />
                      ) : (
                        <Play className="w-4 h-4 text-[var(--telemetry)]" />
                      )}
                      Viaje Auto 1890→2090
                    </span>
                    <span className="sgx-readout text-[11px]">{isAutoVoyage ? 'ON' : 'OFF'}</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    disabled={isRecording}
                    onClick={handleCaptureTriptych}
                    className="w-full min-h-[42px] px-2.5 flex items-center justify-between text-xs font-hud uppercase tracking-wider hover:bg-sgx-yellow/15 cursor-pointer disabled:opacity-40"
                  >
                    <span className="flex items-center gap-2.5">
                      <LayoutGrid className="w-4 h-4 text-[var(--accent-text)]" />
                      Tríptico 3 Eras
                    </span>
                    <span className="sgx-readout text-[11px]">JPG</span>
                  </button>

                  <div className="sgx-hud-rule" />

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setLiteMode((v) => !v);
                      setMenuOpen(false);
                    }}
                    className="w-full min-h-[44px] px-3 flex items-center justify-between text-xs font-hud uppercase tracking-wider hover:bg-sgx-yellow/15 cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5">
                      <Zap className="w-4 h-4 text-[var(--telemetry)]" />
                      Modo Ligero
                    </span>
                    <span className="sgx-readout text-[11px]">{liteMode ? 'ON' : 'OFF'}</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
                      setMenuOpen(false);
                    }}
                    className="w-full min-h-[44px] px-3 flex items-center justify-between text-xs font-hud uppercase tracking-wider hover:bg-sgx-yellow/15 cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5">
                      {theme === 'dark' ? (
                        <Sun className="w-4 h-4 text-[var(--accent-text)]" />
                      ) : (
                        <Moon className="w-4 h-4 text-[var(--telemetry)]" />
                      )}
                      Tema {theme === 'dark' ? 'Claro Papel' : 'Oscuro HUD'}
                    </span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleHideAllUi}
                    className="w-full min-h-[44px] px-3 flex items-center justify-between text-xs font-hud uppercase tracking-wider hover:bg-sgx-yellow/15 cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5">
                      <EyeOff className="w-4 h-4 text-[var(--ink-muted)]" />
                      Esconder Todo el UI [H]
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Inline SGX Alert Banner */}
          {alertMessage && (
            <div className="pointer-events-auto sgx-alert max-w-lg mx-auto mt-2" role="alert">
              <span className="sgx-alert__tag">AVISO</span>
              <span className="text-xs sm:text-sm flex-1">{alertMessage}</span>
              <button
                type="button"
                onClick={() => setAlertMessage(null)}
                aria-label="Descartar aviso"
                className="min-w-[36px] min-h-[36px] flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </header>
      )}

      {/* =====================================================================
          PROGRESSIVE-DISCLOSURE SLIDE-UP BOTTOM SHEET (Closed by default!)
         ===================================================================== */}
      {!hudHidden && sheetMode !== 'closed' && (
        <section
          className="fixed bottom-[174px] sm:bottom-[178px] left-1/2 -translate-x-1/2 z-30 w-[min(720px,calc(100vw-16px))] sgx-panel sgx-panel--solid p-3.5 sm:p-4 max-h-[44dvh] flex flex-col gap-3 shadow-2xl"
          aria-label={sheetMode === 'gallery' ? 'Galería de capturas' : 'Panel de ajustes'}
        >
          {/* Sheet Header */}
          <div className="flex items-center justify-between gap-2">
            {sheetMode === 'gallery' ? (
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-[var(--accent-text)]" />
                <span className="font-display font-bold text-xs sm:text-sm uppercase tracking-wider">
                  Capturas de Sesión ({captures.length})
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1 overflow-x-auto sgx-no-scrollbar" role="tablist">
                {(
                  [
                    { id: 'split', label: 'Dividir', Icon: Layers },
                    { id: 'optics', label: 'Óptica', Icon: SlidersHorizontal },
                    { id: 'tint', label: 'Tinte', Icon: Sparkles },
                    { id: 'story', label: 'SGX.Story', Icon: BookOpen },
                    { id: 'source', label: 'Fuente', Icon: ImageIcon },
                  ] as const
                ).map(({ id, label, Icon }) => {
                  const active = controlTab === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setControlTab(id)}
                      className={`min-h-[40px] px-3 flex items-center gap-1.5 font-hud text-xs uppercase tracking-wider border transition-colors cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-sgx-yellow text-sgx-black-base border-sgx-yellow font-bold'
                          : 'border-[var(--panel-line)] text-[var(--ink)] hover:border-sgx-yellow'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => setSheetMode('closed')}
              aria-label="Cerrar panel"
              className="min-w-[40px] min-h-[40px] flex items-center justify-center border border-[var(--panel-line)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-sgx-yellow cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="sgx-hud-rule" />

          {/* Sheet Scrollable Body */}
          <div className="overflow-y-auto sgx-scroll pr-1 flex flex-col gap-3">
            {sheetMode === 'gallery' ? (
              captures.length === 0 ? (
                <div className="py-5 text-center flex flex-col items-center gap-2">
                  <p className="text-sm text-[var(--ink-muted)]">
                    Aún no tienes capturas en esta sesión.
                  </p>
                  <p className="text-xs text-[var(--ink-muted)]">
                    Usa <strong>CAPTURA</strong>, <strong>GRABAR</strong> o crea un{' '}
                    <strong>Tríptico 3 Eras</strong>.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {captures.map((item) => (
                    <div
                      key={item.id}
                      className="border border-[var(--panel-line)] bg-black/75 flex flex-col"
                    >
                      <button
                        type="button"
                        onClick={() => setPreviewItem(item)}
                        className="relative aspect-video w-full overflow-hidden bg-black cursor-pointer group"
                      >
                        {item.kind === 'photo' ? (
                          <img
                            src={item.url}
                            alt={`Captura ${item.decadeLabel}`}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                        ) : (
                          <video
                            src={item.url}
                            muted
                            playsInline
                            className="w-full h-full object-cover"
                          />
                        )}
                        <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/85 font-mono text-[10px] text-sgx-yellow">
                          {item.decadeLabel}
                        </span>
                      </button>
                      <div className="flex items-center justify-between px-2 py-1.5 text-[11px]">
                        <span className="sgx-readout">{item.kind === 'photo' ? 'JPG' : 'VID'}</span>
                        <button
                          type="button"
                          onClick={() => handleDownloadItem(item)}
                          className="min-w-[32px] min-h-[32px] flex items-center justify-center text-[var(--ink-muted)] hover:text-sgx-yellow cursor-pointer"
                          aria-label={`Descargar ${item.filename}`}
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : controlTab === 'split' ? (
              <div className="flex flex-col gap-3">
                {/* All 9 Multi-Era Layouts + Alpha Mask */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-hud text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                      Distribución Multi-Era ({activeSplitOption.label})
                    </span>
                    {isMultiEraSplit && (
                      <button
                        type="button"
                        disabled={isRecording}
                        onClick={() => handleRandomizeAllZones('Mezcla')}
                        className="min-h-[32px] px-2.5 flex items-center gap-1 border border-sgx-yellow text-[var(--accent-text)] font-hud text-[11px] uppercase tracking-wider hover:bg-sgx-yellow hover:text-sgx-black-base cursor-pointer disabled:opacity-40"
                      >
                        <Shuffle className="w-3.5 h-3.5" />
                        <span>Mezclar {visibleZoneCount}×</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-5 sm:grid-cols-9 gap-1.5">
                    {SPLIT_LAYOUTS.map((opt) => {
                      const active = opt.id === splitLayout;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleChangeSplitLayout(opt.id)}
                          className={`min-h-[42px] px-1.5 flex flex-col items-center justify-center border transition-colors cursor-pointer ${
                            active
                              ? 'bg-sgx-yellow text-sgx-black-base border-sgx-yellow font-bold'
                              : 'border-[var(--panel-line)] text-[var(--ink)] hover:border-sgx-yellow'
                          }`}
                        >
                          <span className="font-mono text-xs leading-none">{opt.shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Alpha Mask Studio Controls (Official 6 SGX Pillars from MCP + Shapes + Custom PNG/SVG) */}
                {splitLayout === 'mask' ? (
                  <div className="flex flex-col gap-3 pt-1 border-t border-[var(--panel-line)]">
                    {/* Sub-tabs: Pilares SGX | Formas + Upload PNG */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setMaskCategory('pillars')}
                          className={`min-h-[34px] px-2.5 font-hud text-[11px] uppercase tracking-wider border cursor-pointer transition-colors ${
                            maskCategory === 'pillars'
                              ? 'bg-sgx-yellow text-sgx-black-base border-sgx-yellow font-bold'
                              : 'border-[var(--panel-line)] text-[var(--ink)] hover:border-sgx-yellow'
                          }`}
                        >
                          Pilares SGX (6)
                        </button>
                        <button
                          type="button"
                          onClick={() => setMaskCategory('shapes')}
                          className={`min-h-[34px] px-2.5 font-hud text-[11px] uppercase tracking-wider border cursor-pointer transition-colors ${
                            maskCategory === 'shapes'
                              ? 'bg-sgx-yellow text-sgx-black-base border-sgx-yellow font-bold'
                              : 'border-[var(--panel-line)] text-[var(--ink)] hover:border-sgx-yellow'
                          }`}
                        >
                          Formas
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => maskInputRef.current?.click()}
                        className="sgx-btn sgx-btn--sm"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{customMask ? 'Cambiar PNG' : 'Subir PNG / SVG'}</span>
                      </button>
                    </div>

                    {maskCategory === 'pillars' ? (
                      <div className="flex flex-col gap-2">
                        {/* Official 6 SGX Pillar Emblems from Spatialgineers MCP (full-color PNG -> pure alpha mask) */}
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                          {SGX_PILLAR_MASKS.map((pillar) => {
                            const active = !customMask && maskPresetId === pillar.id;
                            return (
                              <button
                                key={pillar.id}
                                type="button"
                                onClick={() => handleSelectPillarMask(pillar, false)}
                                style={
                                  active
                                    ? { borderColor: pillar.color }
                                    : undefined
                                }
                                className={`relative p-2 border flex flex-col items-center gap-1 cursor-pointer transition-colors overflow-hidden ${
                                  active
                                    ? 'bg-black/95 text-white ring-1 ring-inset ring-white/25'
                                    : 'bg-[var(--surface)] text-[var(--ink)] border-[var(--panel-line)] hover:border-sgx-yellow'
                                }`}
                              >
                                <span
                                  className="absolute top-0 inset-x-0 h-[3px]"
                                  style={{ backgroundColor: pillar.color }}
                                  aria-hidden="true"
                                />
                                <div className="w-10 h-10 mt-0.5 flex items-center justify-center bg-black/75 p-1">
                                  <img
                                    src={pillar.src}
                                    alt={pillar.name}
                                    className="w-full h-full object-contain"
                                  />
                                </div>
                                <span className="font-hud text-[10px] font-bold uppercase tracking-wide truncate max-w-full">
                                  {pillar.shortName}
                                </span>
                                <span className="font-mono text-[9px] text-[var(--ink-muted)] truncate max-w-full">
                                  {pillar.guildRole}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Active Pillar Binding Bar + 1-Tap Signature Dual-Era Recipe */}
                        {activePillarMask && (
                          <div className="flex items-center justify-between gap-2 flex-wrap px-2.5 py-2 border border-[var(--panel-line)] bg-[var(--surface)]">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-2.5 h-6 shrink-0"
                                style={{ backgroundColor: activePillarMask.color }}
                                aria-hidden="true"
                              />
                              <div className="flex flex-col leading-tight min-w-0">
                                <span className="font-hud text-xs font-bold uppercase tracking-wider text-[var(--ink)] truncate">
                                  {activePillarMask.name} · {activePillarMask.guildRole}
                                </span>
                                <span className="font-mono text-[10px] text-[var(--ink-muted)] truncate">
                                  {activePillarMask.tagline} · Silueta alfa activa (arrastra en visor)
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={isRecording}
                              onClick={() => handleSelectPillarMask(activePillarMask, true)}
                              style={{
                                backgroundColor: activePillarMask.color,
                                borderColor: activePillarMask.color,
                                color: activePillarMask.darkTextOnAccent ? '#050505' : '#FFFFFF',
                              }}
                              className="min-h-[34px] px-2.5 border font-hud text-[11px] font-bold uppercase tracking-wider cursor-pointer hover:opacity-90 disabled:opacity-40 whitespace-nowrap"
                            >
                              Duo {activePillarMask.recommendedInsideYear}s / {activePillarMask.recommendedOutsideYear}s
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Classic SGX Geometric & Logo Masks */
                      <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                        {BUILTIN_MASKS.map((preset) => {
                          const active = !customMask && maskPresetId === preset.id;
                          const thumbUrl =
                            typeof document !== 'undefined' ? getBuiltinMaskDataUrl(preset.id) : '';
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => {
                                setCustomMask(null);
                                setMaskPresetId(preset.id);
                                setMaskOffsetX(0);
                                setMaskOffsetY(0);
                                temporalAudio.playDetent(560);
                              }}
                              className={`p-2 border flex flex-col items-center gap-1 cursor-pointer transition-colors ${
                                active
                                  ? 'bg-sgx-yellow text-sgx-black-base border-sgx-yellow font-bold'
                                  : 'bg-[var(--surface)] text-[var(--ink)] border-[var(--panel-line)] hover:border-sgx-yellow'
                              }`}
                            >
                              <div
                                className={`w-8 h-8 flex items-center justify-center ${
                                  active ? 'bg-sgx-black-base/90 p-1' : 'bg-black/75 p-1'
                                }`}
                              >
                                {thumbUrl && (
                                  <img
                                    src={thumbUrl}
                                    alt={preset.label}
                                    className="w-full h-full object-contain"
                                  />
                                )}
                              </div>
                              <span className="font-hud text-[10px] uppercase tracking-wide truncate max-w-full">
                                {preset.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Scale, Feather & Quick Toggles */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="flex flex-col gap-0.5">
                        <div className="flex justify-between items-baseline">
                          <span className="font-hud text-xs uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                            Tamaño Máscara
                          </span>
                          <span className="sgx-readout text-xs">{Math.round(maskScale * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0.15}
                          max={3.5}
                          step={0.05}
                          value={maskScale}
                          onChange={(e) => setMaskScale(parseFloat(e.target.value))}
                          className="sgx-range"
                        />
                      </label>

                      <label className="flex flex-col gap-0.5">
                        <div className="flex justify-between items-baseline">
                          <span className="font-hud text-xs uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                            Suavizado de Borde
                          </span>
                          <span className="sgx-readout text-xs">{Math.round(maskFeather * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={0.35}
                          step={0.02}
                          value={maskFeather}
                          onChange={(e) => setMaskFeather(parseFloat(e.target.value))}
                          className="sgx-range"
                        />
                      </label>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setMaskInvert((v) => !v)}
                        aria-pressed={maskInvert}
                        className={`sgx-btn sgx-btn--story sgx-btn--sm ${maskInvert ? 'is-active' : ''}`}
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        <span>Invertir</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMaskEdge((v) => !v)}
                        aria-pressed={maskEdge}
                        className={`sgx-btn sgx-btn--story sgx-btn--sm ${maskEdge ? 'is-active' : ''}`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>
                          Borde {activePillarMask ? activePillarMask.shortName : 'SGX'}:{' '}
                          {maskEdge ? 'Sí' : 'No'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMaskOffsetX(0);
                          setMaskOffsetY(0);
                          setMaskScale(0.85);
                          setMaskFeather(0);
                          showToast('Máscara centrada');
                        }}
                        className="sgx-btn sgx-btn--ground sgx-btn--sm"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Centrar</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-[var(--panel-line)] text-xs text-[var(--ink-muted)]">
                    <span>
                      {isMultiEraSplit
                        ? `Toca cualquier cuadro del visor (${visibleZoneCount} zonas) para elegir su era y variante.`
                        : 'Elige 2×, 2×H, 3×, 4×, 6×, 9× o MASK para combinar múltiples épocas a la vez.'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleChangeSplitLayout('mask')}
                      className="sgx-btn sgx-btn--story sgx-btn--sm"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Máscaras de Pilares SGX</span>
                    </button>
                  </div>
                )}
              </div>
            ) : controlTab === 'optics' ? (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="flex flex-col gap-0.5">
                    <div className="flex justify-between items-baseline">
                      <span className="font-hud text-xs uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                        Intensidad FX
                      </span>
                      <span className="sgx-readout text-xs">{intensity.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.05}
                      value={intensity}
                      disabled={isRecording}
                      onChange={(e) => setIntensity(parseFloat(e.target.value))}
                      className="sgx-range"
                    />
                  </label>

                  <label className="flex flex-col gap-0.5">
                    <div className="flex justify-between items-baseline">
                      <span className="font-hud text-xs uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                        Escala FX
                      </span>
                      <span className="sgx-readout text-xs">{scale.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={3}
                      step={0.1}
                      value={scale}
                      disabled={isRecording}
                      onChange={(e) => setScale(parseFloat(e.target.value))}
                      className="sgx-range"
                    />
                  </label>

                  <label className="flex flex-col gap-0.5">
                    <div className="flex justify-between items-baseline">
                      <span className="font-hud text-xs uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                        Grano / Ruido
                      </span>
                      <span className="sgx-readout text-xs">{grain.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.05}
                      value={grain}
                      disabled={isRecording}
                      onChange={(e) => setGrain(parseFloat(e.target.value))}
                      className="sgx-range"
                    />
                  </label>
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-hud text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)] mr-1">
                      Encuadre:
                    </span>
                    {FRAME_ASPECTS.map((frame) => {
                      const active = frame.id === frameAspectId;
                      return (
                        <button
                          key={frame.id}
                          type="button"
                          onClick={() => {
                            setFrameAspectId(frame.id);
                            temporalAudio.playDetent(480);
                          }}
                          className={`min-h-[38px] px-2.5 font-mono text-xs uppercase border transition-colors cursor-pointer ${
                            active
                              ? 'bg-sgx-yellow text-sgx-black-base border-sgx-yellow font-bold'
                              : 'border-[var(--panel-line)] text-[var(--ink)] hover:border-sgx-yellow'
                          }`}
                        >
                          {frame.tag}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={handleResetOptics}
                    disabled={isRecording}
                    className="sgx-btn sgx-btn--ground sgx-btn--sm"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reiniciar</span>
                  </button>
                </div>
              </div>
            ) : controlTab === 'tint' ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="color"
                    value={tintHex}
                    disabled={isRecording}
                    onChange={(e) => setTintHex(e.target.value.toUpperCase())}
                    className="sgx-color-input shrink-0"
                    aria-label="Color de tinte personalizado"
                  />
                  {SGX_TINT_SWATCHES.map((sw) => {
                    const active = tintHex.toUpperCase() === sw.hex.toUpperCase();
                    return (
                      <button
                        key={sw.id}
                        type="button"
                        disabled={isRecording}
                        onClick={() => {
                          setTintHex(sw.hex);
                          if (tintPower === 0) setTintPower(0.35);
                        }}
                        title={`${sw.label} (${sw.pillar})`}
                        aria-label={`Tinte ${sw.label}`}
                        className={`w-10 h-10 border transition-transform cursor-pointer ${
                          active
                            ? 'border-sgx-cyan scale-105'
                            : 'border-[var(--panel-line)] hover:scale-105'
                        }`}
                        style={{ backgroundColor: sw.hex }}
                      />
                    );
                  })}
                </div>

                <label className="flex flex-col gap-0.5">
                  <div className="flex justify-between items-baseline">
                    <span className="font-hud text-xs uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                      Mezcla de Tinte · {tintHex}
                    </span>
                    <span className="sgx-readout text-xs">{Math.round(tintPower * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={tintPower}
                    disabled={isRecording}
                    onChange={(e) => setTintPower(parseFloat(e.target.value))}
                    className="sgx-range"
                  />
                </label>
              </div>
            ) : controlTab === 'story' ? (
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-hud text-xs uppercase tracking-[0.06em] text-[var(--ink-muted)]">
                      Capítulo / Leyenda en tu Postal
                    </span>
                    <span className="hidden sm:inline font-mono text-[11px] text-[var(--telemetry)]">
                      “Toda innovación necesita una historia.”
                    </span>
                  </div>
                  <input
                    type="text"
                    maxLength={64}
                    value={chapterTitle}
                    onChange={(e) => setChapterTitle(e.target.value)}
                    placeholder={activeDecade.storyPrompt}
                    className="w-full min-h-[44px] px-3 text-sm bg-[var(--surface)] border border-[var(--panel-line)] text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-2 focus:outline-[var(--focus-ring)]"
                  />
                </label>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setStampEnabled((v) => !v)}
                    aria-pressed={stampEnabled}
                    className={`sgx-btn sgx-btn--story sgx-btn--sm w-full ${stampEnabled ? 'is-active' : ''}`}
                  >
                    <Stamp className="w-4 h-4" />
                    <span>Sello: {stampEnabled ? 'Sí' : 'No'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isRecording}
                    onClick={() => setIsAutoVoyage((v) => !v)}
                    aria-pressed={isAutoVoyage}
                    className={`sgx-btn sgx-btn--story sgx-btn--sm w-full ${isAutoVoyage ? 'is-active' : ''}`}
                  >
                    {isAutoVoyage ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    <span>{isAutoVoyage ? 'Pausar' : 'Viaje Auto'}</span>
                  </button>

                  <span className="sgx-glow col-span-2 sm:col-span-1 w-full">
                    <button
                      type="button"
                      disabled={isRecording}
                      onClick={handleCaptureTriptych}
                      className="sgx-btn sgx-btn--sm w-full"
                    >
                      <LayoutGrid className="w-4 h-4" />
                      <span>Tríptico 3 Eras</span>
                    </button>
                  </span>
                </div>
              </div>
            ) : (
              /* Source Tab: Live Camera, Upload Photo/Video, or Visual Studio Plates */
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleStartCamera}
                    className={`sgx-btn sgx-btn--story sgx-btn--sm w-full ${sourceMode === 'camera' ? 'is-active' : ''}`}
                  >
                    <Camera className="w-4 h-4" />
                    <span>Cámara en Vivo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`sgx-btn sgx-btn--story sgx-btn--sm w-full ${sourceMode === 'upload' ? 'is-active' : ''}`}
                  >
                    <Upload className="w-4 h-4" />
                    <span>Subir Foto / Video</span>
                  </button>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="font-hud text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
                    Placas de Estudio Instantáneas
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {STUDIO_PLATES.map((plate) => {
                      const active = sourceMode === 'demo' && plateId === plate.id;
                      return (
                        <button
                          key={plate.id}
                          type="button"
                          onClick={() => {
                            setAlertMessage(null);
                            setCameraLive(false);
                            setSourceMode('demo');
                            setPlateId(plate.id);
                            setSheetMode('closed');
                          }}
                          className={`relative overflow-hidden border text-left cursor-pointer group ${
                            active
                              ? 'border-sgx-yellow ring-1 ring-sgx-yellow'
                              : 'border-[var(--panel-line)] hover:border-sgx-yellow'
                          }`}
                        >
                          <img
                            src={plate.src}
                            alt={plate.label}
                            referrerPolicy="no-referrer"
                            className="w-full h-16 object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                          <div className="px-2 py-1 bg-black/85 font-hud text-[10px] uppercase tracking-wider text-white truncate">
                            {plate.label}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* =====================================================================
          THUMB-ZONE BOTTOM CAMERA DECK (Always 1-thumb reachable!)
         ===================================================================== */}
      {!hudHidden && (
        <footer className="fixed bottom-0 inset-x-0 z-20 sgx-scrim-bottom sgx-safe-bottom pt-4 px-3 sm:px-5 pointer-events-none">
          <div className="max-w-2xl mx-auto flex flex-col gap-2 pointer-events-auto">
            {/* Row 1: Active Zone Tag (when Multi-Era) + 3 Instant Variants + Orig + Salto */}
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1 overflow-x-auto sgx-no-scrollbar flex-1">
                {isMultiEraSplit && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextZ = (activeZone + 1) % visibleZoneCount;
                      setActiveZone(nextZ);
                      temporalAudio.playDetent(600);
                      showToast(`${getZoneShortName(nextZ)} · ${DECADES[zones[nextZ].eraIndex].label}`);
                    }}
                    title="Cambiar zona activa en pantalla dividida"
                    className="min-h-[34px] px-2 bg-sgx-cyan text-sgx-black-base border border-sgx-cyan font-mono text-[11px] font-bold uppercase cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {getZoneShortName(activeZone)}
                  </button>
                )}
                {activeDecade.variants.map((variant) => {
                  const isVarActive = variant.index === variantIndex;
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      disabled={isRecording}
                      aria-pressed={isVarActive}
                      onClick={() => handleSetVariant(variant.index)}
                      className={`min-h-[34px] px-2.5 font-hud text-[11px] uppercase tracking-[0.06em] border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        isVarActive
                          ? 'bg-sgx-yellow text-sgx-black-base border-sgx-yellow font-bold'
                          : 'bg-black/55 text-white border-sgx-blue/70 hover:border-sgx-yellow'
                      } disabled:opacity-40`}
                    >
                      {variant.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onPointerDown={() => setPeekingOriginal(true)}
                  onPointerUp={() => setPeekingOriginal(false)}
                  onPointerLeave={() => setPeekingOriginal(false)}
                  onPointerCancel={() => setPeekingOriginal(false)}
                  title="Mantén presionado para ver original sin filtro"
                  aria-label="Mantener para ver original"
                  className={`min-h-[34px] min-w-[38px] px-2 flex items-center justify-center gap-1 font-hud text-[11px] uppercase border cursor-pointer select-none ${
                    peekingOriginal
                      ? 'bg-sgx-cyan text-sgx-black-base border-sgx-cyan font-bold'
                      : 'bg-black/55 text-white border-sgx-blue/70 hover:border-sgx-cyan'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Orig</span>
                </button>
                <button
                  type="button"
                  disabled={isRecording}
                  onClick={handleRandomJump}
                  title="Salto temporal aleatorio (Tecla R)"
                  aria-label="Salto temporal aleatorio"
                  className="min-h-[34px] min-w-[38px] px-2 flex items-center justify-center gap-1 font-hud text-[11px] uppercase border bg-black/55 text-white border-sgx-blue/70 hover:border-sgx-yellow cursor-pointer disabled:opacity-40"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Salto</span>
                </button>
              </div>
            </div>

            {/* Row 2: Horizontal Touch-Scroll Era Dial (1890 — 2090) */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={isRecording || eraIndex === 0}
                onClick={() => {
                  setIsAutoVoyage(false);
                  jumpToEraIndex(eraIndex - 1);
                }}
                aria-label="Era anterior"
                className="hidden sm:flex min-w-[36px] min-h-[42px] items-center justify-center border border-[var(--panel-line)] bg-black/50 text-white hover:border-sgx-yellow cursor-pointer disabled:opacity-30 shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div
                className="flex-1 flex items-center gap-1 overflow-x-auto snap-x snap-mandatory sgx-no-scrollbar py-0.5"
                role="listbox"
                aria-label="Línea de tiempo 1890 a 2090"
              >
                {DECADES.map((d, idx) => {
                  const selected = idx === eraIndex;
                  return (
                    <button
                      key={d.year}
                      ref={(el) => {
                        eraButtonRefs.current[idx] = el;
                      }}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={isRecording}
                      onClick={() => {
                        setIsAutoVoyage(false);
                        jumpToEraIndex(idx);
                      }}
                      className={`snap-center shrink-0 min-w-[58px] min-h-[42px] px-2.5 flex flex-col items-center justify-center border-b-2 transition-colors cursor-pointer ${
                        selected
                          ? 'bg-sgx-yellow border-sgx-yellow text-sgx-black-base font-bold'
                          : 'bg-black/60 border-transparent text-white/85 hover:text-white hover:border-sgx-blue/80'
                      } disabled:opacity-40`}
                    >
                      <span className="font-mono text-xs leading-none">{d.shortLabel}</span>
                      {selected && (
                        <span className="w-1.5 h-1.5 bg-sgx-black-base mt-1" aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                disabled={isRecording || eraIndex === DECADES.length - 1}
                onClick={() => {
                  setIsAutoVoyage(false);
                  jumpToEraIndex(eraIndex + 1);
                }}
                aria-label="Siguiente era"
                className="hidden sm:flex min-w-[36px] min-h-[42px] items-center justify-center border border-[var(--panel-line)] bg-black/50 text-white hover:border-sgx-yellow cursor-pointer disabled:opacity-30 shrink-0"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Row 3: Ergonomic 5-Slot Primary Thumb Action Bar (All >= 44px!) */}
            <div className="grid grid-cols-[48px_1fr_1.35fr_1fr_48px] sm:grid-cols-[52px_1fr_1.3fr_1fr_52px] items-center gap-2 pt-0.5">
              {/* Slot 1: Session Captures Thumbnail */}
              <button
                type="button"
                onClick={() => setSheetMode((m) => (m === 'gallery' ? 'closed' : 'gallery'))}
                aria-label={`Abrir galería (${captures.length} capturas)`}
                className={`relative w-12 h-12 sm:w-[52px] sm:h-[52px] border overflow-hidden flex items-center justify-center cursor-pointer transition-colors ${
                  sheetMode === 'gallery'
                    ? 'border-sgx-yellow bg-sgx-yellow text-sgx-black-base'
                    : 'border-[var(--panel-line)] bg-black/75 text-white hover:border-sgx-yellow'
                }`}
              >
                {latestCapture && latestCapture.kind === 'photo' ? (
                  <img
                    src={latestCapture.url}
                    alt="Última captura"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Film className="w-5 h-5" />
                )}
                {captures.length > 0 && (
                  <span className="absolute top-0 right-0 px-1 bg-sgx-yellow text-sgx-black-base font-mono text-[10px] font-bold leading-tight">
                    {captures.length}
                  </span>
                )}
              </button>

              {/* Slot 2: Live Camera / Flip Lens */}
              {sourceMode === 'camera' && cameraLive ? (
                <button
                  type="button"
                  onClick={handleFlipCamera}
                  className="sgx-btn sgx-btn--story w-full min-h-[48px] !px-2"
                >
                  <SwitchCamera className="w-4 h-4 shrink-0" />
                  <span className="text-xs">Lente</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartCamera}
                  className="sgx-btn sgx-btn--story w-full min-h-[48px] !px-2"
                >
                  <Camera className="w-4 h-4 shrink-0" />
                  <span className="text-xs">Cámara</span>
                </button>
              )}

              {/* Slot 3: Center Hero Shutter CTA */}
              <span className="sgx-glow w-full">
                <button
                  type="button"
                  onClick={handleCapturePhoto}
                  className="sgx-btn w-full min-h-[52px] !px-3"
                >
                  <Camera className="w-4 h-4 shrink-0" />
                  <span>Captura</span>
                </button>
              </span>

              {/* Slot 4: Record / Stop Video */}
              <button
                type="button"
                onClick={handleToggleRecord}
                className={`sgx-btn w-full min-h-[48px] !px-2 ${
                  isRecording ? 'sgx-btn--alert' : 'sgx-btn--ground'
                }`}
              >
                {isRecording ? (
                  <>
                    <Square className="w-3.5 h-3.5 fill-current shrink-0" />
                    <span className="text-xs">{formatTimer(recordSeconds)}</span>
                  </>
                ) : (
                  <>
                    <Circle className="w-3.5 h-3.5 fill-current shrink-0" />
                    <span className="text-xs">Grabar</span>
                  </>
                )}
              </button>

              {/* Slot 5: Tuning & Source Drawer Toggle */}
              <button
                type="button"
                onClick={() => setSheetMode((m) => (m === 'controls' ? 'closed' : 'controls'))}
                aria-expanded={sheetMode === 'controls'}
                aria-label="Abrir ajustes de óptica, tinte, historia y fuente"
                className={`w-12 h-12 sm:w-[52px] sm:h-[52px] border flex items-center justify-center cursor-pointer transition-colors ${
                  sheetMode === 'controls'
                    ? 'bg-sgx-yellow text-sgx-black-base border-sgx-yellow'
                    : 'bg-black/70 text-white border-[var(--panel-line)] hover:border-sgx-yellow'
                }`}
              >
                <SlidersHorizontal className="w-5 h-5" />
              </button>
            </div>
          </div>
        </footer>
      )}

      {/* Full 16-Era Map Modal (opened by tapping Year Odometer) */}
      <EraPickerModal
        open={eraPickerOpen}
        activeEraIndex={eraIndex}
        onSelectEra={(idx) => {
          setIsAutoVoyage(false);
          jumpToEraIndex(idx, 0, true);
        }}
        onRandomJump={handleRandomJump}
        onClose={() => setEraPickerOpen(false)}
      />

      {/* Lightbox Modal for Session Captures & Triptychs */}
      <CaptureModal
        item={previewItem}
        onClose={() => setPreviewItem(null)}
        onDownload={handleDownloadItem}
        onDelete={handleDeleteCapture}
      />
    </div>
  );
}

export default App;
