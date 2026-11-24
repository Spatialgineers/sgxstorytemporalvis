import { useCallback, useEffect, useRef, useState } from 'react';
import { joinRemote, type RemoteMessage } from '../engine/remote';
import { ENGINES, ENGINE_IDS, RECIPES, defaultState, sanitizeRemoteState, type FusionState } from '../state/params';
import { EnginePanel, PalettePicker, RoutesPanel, type Patch } from './Controls';
import { SgxBrandMark } from './SgxBrandMark';

type Status = 'conectando' | 'conectado' | 'desconectado';

/** Vista de teléfono: maneja la pantalla principal por una conexión directa. */
export function Controller({ code }: { code: string }) {
  const [state, setState] = useState<FusionState>(defaultState);
  const [status, setStatus] = useState<Status>('conectando');
  const sendRef = useRef<((msg: RemoteMessage) => void) | null>(null);
  const pending = useRef<FusionState | null>(null);

  useEffect(() => {
    let closed = false;
    let close: (() => void) | null = null;
    joinRemote(code, {
      onMessage: (msg) => {
        if (msg.type === 'state') setState((s) => sanitizeRemoteState(msg.state, s));
      },
      onStatus: setStatus,
    }).then(
      (session) => {
        if (closed) return session.close();
        sendRef.current = session.send;
        close = session.close;
      },
      () => setStatus('desconectado')
    );
    // Los deslizadores disparan muchos cambios: se manda el último, como mucho 20 veces por segundo
    const pump = window.setInterval(() => {
      if (pending.current && sendRef.current) {
        sendRef.current({ type: 'state', state: pending.current });
        pending.current = null;
      }
    }, 50);
    return () => {
      closed = true;
      window.clearInterval(pump);
      close?.();
    };
  }, [code]);

  const patch: Patch = useCallback((change) => {
    setState((s) => {
      const next = { ...s, ...change };
      pending.current = next;
      return next;
    });
  }, []);

  const send = (msg: RemoteMessage) => sendRef.current?.(msg);
  const live = status === 'conectado';

  return (
    <div className="fx-ctrl sgx-grid-bg sgx-scroll">
      <header className="fx-head sgx-cut">
        <SgxBrandMark className="fx-head__mark" />
        <div className="fx-head__titles">
          <h1 className="sgx-type-title">SGX Desmadre</h1>
          <p className="sgx-type-caption sgx-muted-text">Control remoto · sala {code}</p>
        </div>
        <span className="sgx-readout">
          <span className={`sgx-led${live ? '' : ' sgx-led--alert'}`} />
          {status.toUpperCase()}
        </span>
      </header>

      {status === 'desconectado' && (
        <div className="sgx-alert" role="alert">
          <span className="sgx-alert__tag">Sin conexión</span>
          <span className="sgx-alert__msg">
            No se encontró la sala {code}. Confirma que la pantalla principal la tiene abierta y vuelve a escanear el código.
          </span>
        </div>
      )}

      <div className="fx-ctrl__grid">
        {RECIPES.map((r) => (
          <button key={r.id} type="button" className="fx-recipe" style={{ ['--node' as string]: r.color }} onClick={() => send({ type: 'recipe', id: r.id })}>
            <span className="fx-recipe__pillar">{r.pillar}</span>
            <span className="fx-recipe__title">{r.title}</span>
          </button>
        ))}
      </div>

      <div className="fx-ctrl__grid">
        <button type="button" className="sgx-btn fx-desmadre" onClick={() => send({ type: 'desmadre' })}>Desmadre</button>
        <button type="button" className="sgx-btn" onClick={() => send({ type: 'punch' })}>Golpe</button>
      </div>

      {ENGINE_IDS.map((id) => (
        <details key={id} className="sgx-panel sgx-panel--solid fx-ctrl__engine">
          <summary>
            <span className="sgx-type-hud">{ENGINES[id].index} // {ENGINES[id].name}</span>
            <button
              type="button"
              className="sgx-btn sgx-btn--sm"
              aria-pressed={state.on[id]}
              onClick={(e) => {
                e.preventDefault();
                patch({ on: { ...state.on, [id]: !state.on[id] } });
              }}
            >
              {state.on[id] ? 'ON' : 'OFF'}
            </button>
          </summary>
          <div className="fx-panel__body">
            <EnginePanel engine={id} state={state} patch={patch} />
          </div>
        </details>
      ))}

      <details className="sgx-panel sgx-panel--solid fx-ctrl__engine">
        <summary><span className="sgx-type-hud">Rutas y paleta</span></summary>
        <div className="fx-panel__body">
          <PalettePicker state={state} patch={patch} />
          <RoutesPanel state={state} patch={patch} />
        </div>
      </details>
    </div>
  );
}
