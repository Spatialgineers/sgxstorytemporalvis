import type { DataConnection, Peer } from 'peerjs';
import type { FusionState } from '../state/params';

/** Mensajes entre la pantalla principal (host) y un teléfono (control). */
export type RemoteMessage =
  | { type: 'state'; state: unknown }
  | { type: 'punch' }
  | { type: 'desmadre' }
  | { type: 'recipe'; id: string };

const ID_PREFIX = 'sgx-desmadre-';
const isMessage = (m: unknown): m is RemoteMessage =>
  typeof m === 'object' && m !== null && typeof (m as { type?: unknown }).type === 'string';

export function controllerUrl(code: string): string {
  const url = new URL(window.location.href);
  url.search = `?ctrl=${code}`;
  url.hash = '';
  return url.toString();
}

/** Host: abre una sala y acepta teléfonos. PeerJS se carga solo cuando se pide. */
export async function hostRemote(handlers: {
  onMessage: (msg: RemoteMessage) => void;
  onPeers: (count: number) => void;
  getState: () => FusionState;
}): Promise<{ code: string; broadcast: (state: FusionState) => void; close: () => void }> {
  const { Peer } = await import('peerjs');
  const code = Math.random().toString(36).slice(2, 8);
  const peer: Peer = new Peer(ID_PREFIX + code);
  const conns = new Set<DataConnection>();

  await new Promise<void>((resolve, reject) => {
    peer.on('open', () => resolve());
    peer.on('error', (err) => reject(err));
  });

  peer.on('connection', (conn) => {
    const drop = () => {
      conns.delete(conn);
      handlers.onPeers(conns.size);
    };
    conn.on('open', () => {
      conns.add(conn);
      handlers.onPeers(conns.size);
      conn.send({ type: 'state', state: handlers.getState() });
    });
    conn.on('data', (data) => {
      if (isMessage(data)) handlers.onMessage(data);
    });
    conn.on('close', drop);
    conn.on('error', drop);
  });

  return {
    code,
    broadcast: (state) => {
      for (const conn of conns) if (conn.open) conn.send({ type: 'state', state });
    },
    close: () => peer.destroy(),
  };
}

/** Control: se conecta a la sala del host. */
export async function joinRemote(
  code: string,
  handlers: { onMessage: (msg: RemoteMessage) => void; onStatus: (status: 'conectado' | 'desconectado') => void }
): Promise<{ send: (msg: RemoteMessage) => void; close: () => void }> {
  const { Peer } = await import('peerjs');
  const peer: Peer = new Peer();
  await new Promise<void>((resolve, reject) => {
    peer.on('open', () => resolve());
    peer.on('error', (err) => reject(err));
  });
  const conn = peer.connect(ID_PREFIX + code, { reliable: true });
  conn.on('open', () => handlers.onStatus('conectado'));
  conn.on('data', (data) => {
    if (isMessage(data)) handlers.onMessage(data);
  });
  conn.on('close', () => handlers.onStatus('desconectado'));
  conn.on('error', () => handlers.onStatus('desconectado'));
  peer.on('error', () => handlers.onStatus('desconectado'));
  return {
    send: (msg) => {
      if (conn.open) conn.send(msg);
    },
    close: () => peer.destroy(),
  };
}
