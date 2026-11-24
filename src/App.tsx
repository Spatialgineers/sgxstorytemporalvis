import { useCallback, useEffect, useRef, useState } from 'react';
import { EnginePanel, PalettePicker, RoutesPanel, Seg, Select, SignalMeters, type Patch } from './components/Controls';
import { SgxBrandMark } from './components/SgxBrandMark';
import { getDecadeByYear } from './data/decades';
import { STUDIO_PLATES } from './data/plates';
import { FusionEngine } from './engine/FusionEngine';
import { controllerUrl, hostRemote, type RemoteMessage } from './engine/remote';
import {
  ENGINES,
  ENGINE_IDS,
  RECIPES,
  SYNTH_MODES,
  applyRecipe,
  defaultState,
  desmadre,
  sanitizeRemoteState,
  type AudioMode,
  type EngineId,
  type FusionState,
  type SourceMode,
} from './state/params';

type Section = 'source' | EngineId | 'routes' | 'output' | 'remote';

interface Capture {
  id: number;
  url: string;
  kind: 'foto' | 'video';
  ext: string;
}

interface RemoteSession {
  code: string;
  url: string;
  qr: string;
  peers: number;
}

const SECTION_TITLES: Record<Exclude<Section, EngineId>, string> = {
  source: 'Fuente',
  routes: 'Rutas de señal',
  output: 'Salida',
  remote: 'Control remoto',
};

function engineSummary(id: EngineId, s: FusionState): string {
  switch (id) {
    case 'story':
      return getDecadeByYear(s.storyYear).label;
    case 'spark':
      return s.sparkInSignal ? 'En la señal' : 'Encima';
    case 'synth':
      return SYNTH_MODES[s.synthMode] + (s.synthModeB >= 0 ? ' + B' : '');
    case 'nexus':
      return `${Math.round(s.p['nexus.density'])}² puntos`;
    case 'glitch':
      return `${s.routes.filter((r) => r.dst.startsWith('glitch.')).length} rutas`;
  }
}

export function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<FusionEngine | null>(null);
  const [state, setState] = useState<FusionState>(defaultState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const [engine, setEngine] = useState<FusionEngine | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  // En pantallas angostas el panel taparía la imagen: arranca cerrado
  const [section, setSection] = useState<Section | null>(() => (window.innerWidth > 900 ? 'story' : null));
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [hudHidden, setHudHidden] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState({ fps: 0, width: 0, height: 0, tracker: 'apagado' });
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [recSeconds, setRecSeconds] = useState<number | null>(null);
  const [remote, setRemote] = useState<RemoteSession | null>(null);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const remoteRef = useRef<{ broadcast: (s: FusionState) => void; close: () => void } | null>(null);
  const fromRemoteRef = useRef(false);
  const captureId = useRef(0);

  const patch: Patch = useCallback((change) => {
    setRecipeId(null);
    setState((s) => ({ ...s, ...change }));
  }, []);

  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 2200);
  }, []);

  /* ------------------------------- motor -------------------------------- */

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let created: FusionEngine;
    try {
      created = new FusionEngine(mount, () => stateRef.current, {
        onSourceError: (message) => {
          setAlert(`${message} Se usa la señal sintética.`);
          setState((s) => ({ ...s, source: 'signal' }));
        },
        onOverload: () => flash('CHISPA MÁXIMA // SOBRECARGA'),
      });
    } catch {
      setFatal('Este navegador no pudo iniciar WebGL. Activa la aceleración por hardware o prueba otro navegador.');
      return;
    }
    engineRef.current = created;
    setEngine(created);
    const poll = window.setInterval(() => {
      const t = created.telemetry;
      setTelemetry((prev) =>
        prev.fps === t.fps && prev.width === t.width && prev.height === t.height && prev.tracker === t.tracker
          ? prev
          : { fps: t.fps, width: t.width, height: t.height, tracker: t.tracker }
      );
    }, 500);
    return () => {
      window.clearInterval(poll);
      created.dispose();
      engineRef.current = null;
    };
  }, [flash]);

  /* ------------------------------ acciones ------------------------------ */

  const runDesmadre = useCallback(() => {
    setRecipeId(null);
    setState((s) => desmadre(s));
    engineRef.current?.punch();
  }, []);

  const runRecipe = useCallback((id: string) => {
    const recipe = RECIPES.find((r) => r.id === id);
    if (!recipe) return;
    setRecipeId(id);
    setState((s) => applyRecipe(s, recipe));
    engineRef.current?.punch();
  }, []);

  const reset = useCallback(() => {
    setRecipeId(null);
    setState((s) => ({ ...defaultState(), source: s.source, plateId: s.plateId, audio: s.audio, lite: s.lite }));
  }, []);

  const toggleEngine = useCallback(
    (id: EngineId) => patch({ on: { ...stateRef.current.on, [id]: !stateRef.current.on[id] } }),
    [patch]
  );

  const setAudio = useCallback(
    async (audio: AudioMode) => {
      if (audio === 'mic' && !(await engineRef.current?.audio.enableMic())) {
        setAlert('No hay micrófono disponible o el permiso fue negado. Sigue el pulso simulado.');
        return;
      }
      if (audio !== 'mic') engineRef.current?.audio.disableMic();
      patch({ audio });
    },
    [patch]
  );

  const takePhoto = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const s = stateRef.current;
    const stamp = ENGINE_IDS.filter((id) => s.on[id]).map((id) => ENGINES[id].name).join(' + ') || 'SEÑAL DIRECTA';
    const url = eng.capturePhoto(stamp);
    setCaptures((list) => [{ id: ++captureId.current, url, kind: 'foto', ext: 'jpg' }, ...list]);
    flash('FOTO GUARDADA EN SALIDA');
  }, [flash]);

  const toggleRecording = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (eng.recording) {
      eng.stopRecording();
      return;
    }
    const started = eng.startRecording((url, mime) => {
      setRecSeconds(null);
      setCaptures((list) => [
        { id: ++captureId.current, url, kind: 'video', ext: mime.includes('mp4') ? 'mp4' : 'webm' },
        ...list,
      ]);
      flash('VIDEO GUARDADO EN SALIDA');
    });
    if (started) setRecSeconds(0);
    else setAlert('Este navegador no permite grabar el lienzo.');
  }, [flash]);

  useEffect(() => {
    if (recSeconds === null) return;
    const timer = window.setTimeout(() => setRecSeconds((s) => (s === null ? null : s + 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [recSeconds]);

  /* ---------------------------- control remoto --------------------------- */

  const onRemoteMessage = useCallback(
    (msg: RemoteMessage) => {
      if (msg.type === 'state') {
        fromRemoteRef.current = true;
        setRecipeId(null);
        setState((s) => sanitizeRemoteState(msg.state, s));
      } else if (msg.type === 'punch') engineRef.current?.punch();
      else if (msg.type === 'desmadre') runDesmadre();
      else if (msg.type === 'recipe') runRecipe(msg.id);
    },
    [runDesmadre, runRecipe]
  );
  const onRemoteMessageRef = useRef(onRemoteMessage);
  onRemoteMessageRef.current = onRemoteMessage;

  const openRemote = useCallback(async () => {
    setRemoteBusy(true);
    try {
      const session = await hostRemote({
        onMessage: (msg) => onRemoteMessageRef.current(msg),
        onPeers: (peers) => setRemote((r) => (r ? { ...r, peers } : r)),
        getState: () => stateRef.current,
      });
      remoteRef.current = session;
      const url = controllerUrl(session.code);
      const QR = await import('qrcode');
      const qr = await QR.toDataURL(url, { margin: 1, width: 320, color: { dark: '#050505', light: '#FDCC0D' } });
      setRemote({ code: session.code, url, qr, peers: 0 });
    } catch {
      setAlert('No se pudo abrir la sala de control remoto. Revisa la conexión a internet.');
    } finally {
      setRemoteBusy(false);
    }
  }, []);

  const closeRemote = useCallback(() => {
    remoteRef.current?.close();
    remoteRef.current = null;
    setRemote(null);
  }, []);

  useEffect(() => () => remoteRef.current?.close(), []);

  // Los cambios hechos aquí viajan a los teléfonos; los que vinieron de un teléfono no se le devuelven.
  useEffect(() => {
    if (fromRemoteRef.current) fromRemoteRef.current = false;
    else remoteRef.current?.broadcast(state);
  }, [state]);

  /* ------------------------------- teclado ------------------------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      const key = e.key.toLowerCase();
      if (key === ' ') {
        if (target.tagName === 'BUTTON') return;
        e.preventDefault();
        engineRef.current?.punch();
      } else if (key === 'd') runDesmadre();
      else if (key === 'h') setHudHidden((v) => !v);
      else if (key >= '1' && key <= '5') toggleEngine(ENGINE_IDS[Number(key) - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runDesmadre, toggleEngine]);

  /* -------------------------------- vista -------------------------------- */

  const chainNode = (id: Section, index: string, name: string, detail: string, color: string, on?: boolean) => (
    <div className="fx-node" key={id} data-selected={section === id} data-off={on === false} style={{ ['--node' as string]: color }}>
      {on !== undefined && (
        <button
          type="button"
          className="fx-node__power"
          aria-pressed={on}
          aria-label={`${on ? 'Apagar' : 'Encender'} ${name}`}
          onClick={() => toggleEngine(id as EngineId)}
        >
          <span className={`sgx-led${on ? '' : ' fx-led-off'}`} />
          {on ? 'ON' : 'OFF'}
        </button>
      )}
      <button type="button" className="fx-node__body" aria-pressed={section === id} onClick={() => setSection(section === id ? null : id)}>
        <span className="fx-node__index">{index}</span>
        <span className="fx-node__name">{name}</span>
        <span className="fx-node__detail">{detail}</span>
      </button>
    </div>
  );

  const sourceLabel: Record<SourceMode, string> = { signal: 'Señal sintética', camera: 'Cámara', plate: 'Placa', file: 'Archivo' };
  const panelTitle = section && (section in ENGINES ? `${ENGINES[section as EngineId].index} // SGX ${ENGINES[section as EngineId].name}` : SECTION_TITLES[section as keyof typeof SECTION_TITLES]);

  return (
    <div className="fx-root sgx-grid-bg">
      <div className="fx-canvas" ref={mountRef} />

      {fatal && (
        <div className="fx-center">
          <div className="sgx-alert" role="alert">
            <span className="sgx-alert__tag">Sin WebGL</span>
            <span className="sgx-alert__msg">{fatal}</span>
          </div>
        </div>
      )}

      {hudHidden ? (
        <button type="button" className="sgx-btn sgx-btn--sm fx-restore" onClick={() => setHudHidden(false)}>
          Mostrar HUD
        </button>
      ) : (
        <div className="fx-hud">
          <header className="fx-head sgx-cut">
            <SgxBrandMark className="fx-head__mark" />
            <div className="fx-head__titles">
              <h1 className="sgx-type-title">SGX Desmadre</h1>
              <p className="sgx-type-caption sgx-muted-text">SGX.Synthesize // 5 motores, una señal</p>
            </div>
            <div className="fx-head__telemetry" aria-live="off">
              <span className="sgx-readout"><span className="sgx-readout__k">FPS</span>{telemetry.fps}</span>
              <span className="sgx-readout"><span className="sgx-readout__k">RES</span>{telemetry.width}×{telemetry.height}</span>
              <span className="sgx-readout"><span className="sgx-readout__k">SPARK</span>{telemetry.tracker.toUpperCase()}</span>
              <span className="sgx-readout"><span className="sgx-readout__k">AUDIO</span>{state.audio === 'mic' ? 'MIC' : state.audio === 'sim' ? 'PULSO SIM' : 'OFF'}</span>
            </div>
            <div className="fx-head__actions">
              <button type="button" className="sgx-btn sgx-btn--sm sgx-btn--blue" aria-pressed={state.lite} onClick={() => patch({ lite: !state.lite })}>
                Modo ligero
              </button>
              <button type="button" className="sgx-btn sgx-btn--sm sgx-btn--blue" onClick={() => setHudHidden(true)}>
                Ocultar HUD
              </button>
            </div>
          </header>

          {alert && (
            <div className="sgx-alert fx-alert" role="alert">
              <span className="sgx-alert__tag">Aviso</span>
              <span className="sgx-alert__msg">{alert}</span>
              <button type="button" className="sgx-btn sgx-btn--sm" onClick={() => setAlert(null)}>
                Entendido
              </button>
            </div>
          )}

          <nav className="fx-rail sgx-scroll" aria-label="Cadena de señal">
            <p className="fx-rail__title sgx-type-caption">Cadena de señal</p>
            {chainNode('source', 'IN', 'FUENTE', sourceLabel[state.source], '#888888')}
            {ENGINE_IDS.map((id) => chainNode(id, ENGINES[id].index, ENGINES[id].name, state.on[id] ? engineSummary(id, state) : ENGINES[id].role, ENGINES[id].color, state.on[id]))}
            {chainNode('routes', 'MOD', 'RUTAS', `${state.routes.length} activas`, '#00DDFF')}
            {chainNode('output', 'OUT', 'SALIDA', captures.length ? `${captures.length} capturas` : 'Foto y video', '#888888')}
            {chainNode('remote', 'RC', 'REMOTO', remote ? `Sala ${remote.code} · ${remote.peers}` : 'Teléfono', '#888888')}
          </nav>

          {section && (
            <section className="fx-panel sgx-panel sgx-panel--solid" aria-label={panelTitle ?? undefined}>
              <div className="fx-panel__head">
                <h2 className="sgx-type-hud sgx-accent-text">{panelTitle}</h2>
                <button type="button" className="sgx-btn sgx-btn--sm sgx-btn--blue" onClick={() => setSection(null)}>
                  Cerrar
                </button>
              </div>
              {section in ENGINES && (
                <p className="sgx-type-caption sgx-muted-text">
                  Viene de {ENGINES[section as EngineId].origin} · {ENGINES[section as EngineId].role}
                </p>
              )}
              <div className="fx-panel__body sgx-scroll">
                {section in ENGINES && <EnginePanel engine={section as EngineId} state={state} patch={patch} />}

                {section === 'source' && (
                  <>
                    <Seg
                      label="Imagen"
                      value={state.source}
                      options={[
                        { value: 'signal' as SourceMode, label: 'Señal' },
                        { value: 'camera' as SourceMode, label: 'Cámara' },
                        { value: 'plate' as SourceMode, label: 'Placa' },
                      ]}
                      onChange={(source) => patch({ source })}
                    />
                    <label className="sgx-btn sgx-btn--sm fx-file" data-active={state.source === 'file'}>
                      Subir foto o video
                      <input
                        type="file"
                        accept="image/*,video/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            engineRef.current?.setFile(file);
                            patch({ source: 'file' });
                          }
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {state.source === 'plate' && (
                      <Select
                        label="Placa de estudio"
                        value={state.plateId}
                        options={STUDIO_PLATES.map((p) => ({ value: p.id, label: `${p.label} · ${p.location}` }))}
                        onChange={(plateId) => patch({ plateId })}
                      />
                    )}
                    {state.source === 'camera' && (
                      <Seg
                        label="Espejo"
                        value={state.mirror}
                        options={[{ value: true, label: 'Sí' }, { value: false, label: 'No' }]}
                        onChange={(mirror) => patch({ mirror })}
                      />
                    )}
                    <Seg
                      label="Audio"
                      value={state.audio}
                      options={[
                        { value: 'sim' as AudioMode, label: 'Pulso sim' },
                        { value: 'mic' as AudioMode, label: 'Micrófono' },
                        { value: 'off' as AudioMode, label: 'Sin audio' },
                      ]}
                      onChange={(audio) => void setAudio(audio)}
                    />
                    <PalettePicker state={state} patch={patch} />
                  </>
                )}

                {section === 'routes' && (
                  <RoutesPanel state={state} patch={patch} meters={engine && <SignalMeters bus={engine.signals} />} />
                )}

                {section === 'output' && (
                  <>
                    <div className="fx-seg__row">
                      <button type="button" className="sgx-btn sgx-btn--sm" onClick={takePhoto}>Foto</button>
                      <button type="button" className="sgx-btn sgx-btn--sm" aria-pressed={recSeconds !== null} onClick={toggleRecording}>
                        {recSeconds !== null ? `Detener · ${recSeconds}s` : 'Grabar video'}
                      </button>
                    </div>
                    {captures.length === 0 && <p className="fx-note">Aquí aparecen tus fotos y videos, listos para descargar. Se pierden al cerrar la página.</p>}
                    <ul className="fx-captures">
                      {captures.map((c) => (
                        <li key={c.id}>
                          {c.kind === 'foto' ? <img src={c.url} alt={`Captura ${c.id}`} /> : <video src={c.url} muted loop playsInline controls />}
                          <a className="sgx-btn sgx-btn--sm" href={c.url} download={`sgx-desmadre-${c.id}.${c.ext}`}>
                            Descargar {c.kind}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {section === 'remote' && (
                  <>
                    <p className="fx-note">
                      Abre una sala y escanea el código con un teléfono para manejar los cinco motores desde ahí.
                      La conexión es directa entre los dos dispositivos.
                    </p>
                    {remote ? (
                      <>
                        <img className="fx-qr" src={remote.qr} alt={`Código QR de la sala ${remote.code}`} />
                        <p className="sgx-readout"><span className="sgx-readout__k">SALA</span>{remote.code}</p>
                        <p className="sgx-readout"><span className="sgx-readout__k">TELÉFONOS</span>{remote.peers}</p>
                        <p className="fx-note fx-break">{remote.url}</p>
                        <button type="button" className="sgx-btn sgx-btn--sm sgx-btn--blue" onClick={closeRemote}>Cerrar sala</button>
                      </>
                    ) : (
                      <button type="button" className="sgx-btn sgx-btn--sm" disabled={remoteBusy} onClick={() => void openRemote()}>
                        {remoteBusy ? 'Abriendo sala…' : 'Abrir sala'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </section>
          )}

          <footer className="fx-dock sgx-cut">
            <div className="fx-recipes sgx-scroll" role="group" aria-label="Recetas por pilar">
              {RECIPES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="fx-recipe"
                  aria-pressed={recipeId === r.id}
                  title={r.note}
                  style={{ ['--node' as string]: r.color }}
                  onClick={() => runRecipe(r.id)}
                >
                  <span className="fx-recipe__pillar">{r.pillar}</span>
                  <span className="fx-recipe__title">{r.title}</span>
                </button>
              ))}
            </div>
            <div className="fx-actions">
              <span className="sgx-glow">
                <button type="button" className="sgx-btn fx-desmadre" onClick={runDesmadre} title="Tecla D">
                  Desmadre
                </button>
              </span>
              <button type="button" className="sgx-btn sgx-btn--sm" onClick={() => engineRef.current?.punch()} title="Barra espaciadora">
                Golpe
              </button>
              <button type="button" className="sgx-btn sgx-btn--sm" onClick={takePhoto}>Foto</button>
              <button type="button" className="sgx-btn sgx-btn--sm" aria-pressed={recSeconds !== null} onClick={toggleRecording}>
                {recSeconds !== null ? `Rec ${recSeconds}s` : 'Rec'}
              </button>
              <button type="button" className="sgx-btn sgx-btn--sm sgx-btn--blue" onClick={reset}>Limpiar</button>
            </div>
          </footer>
        </div>
      )}

      {toast && <div className="fx-toast sgx-type-hud" role="status">{toast}</div>}
    </div>
  );
}
