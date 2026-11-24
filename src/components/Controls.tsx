import { useEffect, useRef, type ReactNode } from 'react';
import { DECADES, SPLIT_LAYOUTS, getDecadeByYear } from '../data/decades';
import type { SignalBus } from '../engine/signals';
import {
  ENGINES,
  MASKS,
  MAX_ROUTES,
  NEXUS_SHAPES,
  PALETTES,
  PARAMS,
  PARAM_MAP,
  SIGNALS,
  SYNTH_MODES,
  type EngineId,
  type FusionState,
  type Route,
  type SignalId,
} from '../state/params';

export type Patch = (patch: Partial<FusionState>) => void;

interface PanelProps {
  state: FusionState;
  patch: Patch;
}

const fmt = (v: number, step: number, unit = '') =>
  `${step >= 1 ? Math.round(v) : v.toFixed(step < 0.01 ? 3 : 2)}${unit}`;

export function ParamSlider({ id, state, patch }: PanelProps & { id: string }) {
  const def = PARAM_MAP[id];
  const value = state.p[id] ?? def.def;
  const routed = state.routes.filter((r) => r.dst === id);
  return (
    <label className="sgx-field">
      <span className="sgx-field__label">
        {def.label}
        {routed.length > 0 && (
          <span className="fx-routed" title="Una ruta mueve este control">
            {' '}
            ← {routed.map((r) => SIGNALS.find((s) => s.id === r.src)?.label).join(' + ')}
          </span>
        )}
      </span>
      <span className="sgx-field__value">{fmt(value, def.step, def.unit)}</span>
      <input
        className="sgx-range"
        type="range"
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
        onChange={(e) => patch({ p: { ...state.p, [id]: Number(e.target.value) } })}
      />
    </label>
  );
}

export function Select<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="fx-select">
      <span className="sgx-field__label">{label}</span>
      <select
        value={String(value)}
        onChange={(e) => onChange(options.find((o) => String(o.value) === e.target.value)!.value)}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Seg<T extends string | number | boolean>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="fx-seg" role="group" aria-label={label}>
      <span className="sgx-field__label">{label}</span>
      <div className="fx-seg__row">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            className="sgx-btn sgx-btn--sm"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Sliders({ engine, skip = [], ...rest }: PanelProps & { engine: EngineId; skip?: string[] }) {
  return (
    <>
      {PARAMS.filter((d) => d.engine === engine && !skip.includes(d.id)).map((d) => (
        <ParamSlider key={d.id} id={d.id} {...rest} />
      ))}
    </>
  );
}

export function MaskPicker({ state, patch }: PanelProps) {
  return (
    <Select
      label="Máscara de pilar (compartida)"
      value={state.maskId}
      options={MASKS.map((m) => ({ value: m.id, label: m.label }))}
      onChange={(maskId) => patch({ maskId })}
    />
  );
}

export function PalettePicker({ state, patch }: PanelProps) {
  return (
    <div className="fx-seg" role="group" aria-label="Paleta">
      <span className="sgx-field__label">Paleta (compartida por los 5 motores)</span>
      <div className="fx-seg__row">
        {PALETTES.map((p, i) => (
          <button
            key={p.a + p.b}
            type="button"
            className="fx-swatch"
            aria-label={`Paleta ${i + 1}`}
            aria-pressed={state.colorA === p.a && state.colorB === p.b}
            style={{ background: `linear-gradient(135deg, ${p.a} 50%, ${p.b} 50%)` }}
            onClick={() => patch({ colorA: p.a, colorB: p.b })}
          />
        ))}
      </div>
    </div>
  );
}

const MODE_OPTIONS = SYNTH_MODES.map((label, i) => ({ value: i, label: `${String(i).padStart(2, '0')} ${label}` }));

/** Controles propios de cada motor. Lo usan la pantalla principal y el control remoto. */
export function EnginePanel({ engine, state, patch }: PanelProps & { engine: EngineId }) {
  const rest = { state, patch };
  if (engine === 'story') {
    const decade = getDecadeByYear(state.storyYear);
    const masked = state.storyLayout === 'mask';
    return (
      <>
        <Select
          label="Era"
          value={state.storyYear}
          options={DECADES.map((d) => ({ value: d.year, label: `${d.label} · ${d.title}` }))}
          onChange={(storyYear) => patch({ storyYear })}
        />
        <p className="fx-note">{decade.description}</p>
        <Seg
          label="Variante"
          value={state.storyVariant}
          options={decade.variants.map((v) => ({ value: v.index as number, label: v.label }))}
          onChange={(storyVariant) => patch({ storyVariant })}
        />
        <Select
          label="Composición"
          value={state.storyLayout}
          options={SPLIT_LAYOUTS.map((l) => ({ value: l.id, label: `${l.shortLabel} · ${l.label}` }))}
          onChange={(storyLayout) => patch({ storyLayout })}
        />
        {masked && <MaskPicker {...rest} />}
        <Sliders engine="story" skip={masked ? [] : ['story.maskScale']} {...rest} />
      </>
    );
  }
  if (engine === 'spark') {
    return (
      <>
        <Seg
          label="Dónde entra el HUD"
          value={state.sparkInSignal}
          options={[
            { value: true, label: 'En la señal' },
            { value: false, label: 'Encima, limpio' },
          ]}
          onChange={(sparkInSignal) => patch({ sparkInSignal })}
        />
        <p className="fx-note">
          En la señal, los arcos pasan por Synth, Nexus y Glitch igual que la imagen. Sin cámara, las manos se
          simulan.
        </p>
        <Sliders engine="spark" {...rest} />
      </>
    );
  }
  if (engine === 'synth') {
    const dual = state.synthModeB >= 0;
    return (
      <>
        <Select label="Motor A" value={state.synthMode} options={MODE_OPTIONS} onChange={(synthMode) => patch({ synthMode })} />
        <Select
          label="Motor B (dentro de la máscara)"
          value={state.synthModeB}
          options={[{ value: -1, label: 'Ninguno' }, ...MODE_OPTIONS]}
          onChange={(synthModeB) => patch({ synthModeB })}
        />
        {dual && <MaskPicker {...rest} />}
        <Seg
          label="Simetría"
          value={state.synthMirror}
          options={[
            { value: 0, label: 'No' },
            { value: 1, label: 'Espejo' },
            { value: 2, label: 'Cuádruple' },
          ]}
          onChange={(synthMirror) => patch({ synthMirror })}
        />
        <Sliders engine="synth" skip={dual ? [] : ['synth.maskScale', 'synth.maskOpacity']} {...rest} />
      </>
    );
  }
  if (engine === 'nexus') {
    return (
      <>
        <Select
          label="Forma de partícula"
          value={state.nexusShape}
          options={NEXUS_SHAPES.map((label, i) => ({ value: i, label }))}
          onChange={(nexusShape) => patch({ nexusShape })}
        />
        <Seg
          label="Color"
          value={state.nexusDepthColor}
          options={[
            { value: false, label: 'De la imagen' },
            { value: true, label: 'Por profundidad' },
          ]}
          onChange={(nexusDepthColor) => patch({ nexusDepthColor })}
        />
        <p className="fx-note">Arrastra sobre la imagen para orbitar la nube.</p>
        <Sliders engine="nexus" {...rest} />
      </>
    );
  }
  return <Sliders engine="glitch" {...rest} />;
}

/** Barras vivas de las señales; se actualizan fuera de React para no re-renderizar a 60 Hz. */
export function SignalMeters({ bus }: { bus: SignalBus }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      ref.current?.querySelectorAll<HTMLElement>('[data-signal]').forEach((el) => {
        el.style.transform = `scaleX(${Math.min(1, Math.max(0, bus[el.dataset.signal as SignalId]))})`;
      });
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [bus]);
  return (
    <div className="fx-meters" ref={ref}>
      {SIGNALS.map((s) => (
        <div key={s.id} className="fx-meter">
          <span className="fx-meter__k">{s.label}</span>
          <span className="fx-meter__track">
            <span className="fx-meter__fill" data-signal={s.id} />
          </span>
        </div>
      ))}
    </div>
  );
}

const SIGNAL_OPTIONS = SIGNALS.map((s) => ({ value: s.id as SignalId, label: `${s.group} · ${s.label}` }));
const TARGET_OPTIONS = PARAMS.map((d) => ({ value: d.id, label: `${ENGINES[d.engine].name} · ${d.label}` }));

/** Rutas: cualquier señal puede mover cualquier control de cualquier motor. */
export function RoutesPanel({ state, patch, meters }: PanelProps & { meters?: ReactNode }) {
  const update = (i: number, change: Partial<Route>) =>
    patch({ routes: state.routes.map((r, k) => (k === i ? { ...r, ...change } : r)) });
  return (
    <>
      <p className="fx-note">
        Cada ruta suma una señal viva a un control. Así el audio, las manos o el puntero mueven motores que no
        son el suyo.
      </p>
      {meters}
      {state.routes.map((r, i) => (
        <div className="fx-route" key={i}>
          <Select label={`Ruta ${i + 1} · señal`} value={r.src} options={SIGNAL_OPTIONS} onChange={(src) => update(i, { src })} />
          <Select label="Mueve" value={r.dst} options={TARGET_OPTIONS} onChange={(dst) => update(i, { dst })} />
          <label className="sgx-field">
            <span className="sgx-field__label">Cantidad</span>
            <span className="sgx-field__value">{r.amt.toFixed(2)}</span>
            <input
              className="sgx-range"
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={r.amt}
              onChange={(e) => update(i, { amt: Number(e.target.value) })}
            />
          </label>
          <button
            type="button"
            className="sgx-btn sgx-btn--sm sgx-btn--blue"
            onClick={() => patch({ routes: state.routes.filter((_, k) => k !== i) })}
          >
            Quitar ruta {i + 1}
          </button>
        </div>
      ))}
      {state.routes.length < MAX_ROUTES && (
        <button
          type="button"
          className="sgx-btn sgx-btn--sm"
          onClick={() => patch({ routes: [...state.routes, { src: 'bass', dst: 'glitch.rgbX', amt: 0.2 }] })}
        >
          + Nueva ruta
        </button>
      )}
    </>
  );
}
