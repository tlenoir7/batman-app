import { io, type Socket } from 'socket.io-client';

import { API_BASE } from './config';

/** Default Engine.IO path (same as angel-app). */
export const SOCKET_IO_PATH = '/socket.io';

let socket: Socket | null = null;

type ConnListener = (connected: boolean) => void;
const connListeners = new Set<ConnListener>();

function notifyConnection(connected: boolean): void {
  connListeners.forEach((fn) => {
    fn(connected);
  });
}

/** Re-read socket.connected and broadcast (handles races where `connect` fired before listeners existed). */
function syncConnectionFromSocket(): void {
  notifyConnection(socket?.connected ?? false);
}

/** Subscribe to live Socket.IO connection state (angel-style client, app-level observers). */
export function subscribeSocketConnection(listener: ConnListener): () => void {
  connListeners.add(listener);
  listener(socket?.connected ?? false);
  // Handshake may complete in the same turn or before this subscriber was registered.
  queueMicrotask(() => listener(socket?.connected ?? false));
  return () => connListeners.delete(listener);
}

function onReconnectAttempt(n: number) {
  console.log('[batman-socket] reconnect_attempt', {
    attempt: n,
    url: API_BASE,
    path: SOCKET_IO_PATH,
  });
}

function onReconnectOk(n: number) {
  console.log('[batman-socket] reconnect OK', { attempts: n });
}

function onManagerReconnect(n: number) {
  onReconnectOk(n);
  syncConnectionFromSocket();
}

function onEngineOpen() {
  syncConnectionFromSocket();
}

function onReconnectError(err: Error) {
  console.warn('[batman-socket] reconnect_error', { message: err?.message });
}

function onReconnectFailed() {
  console.warn('[batman-socket] reconnect_failed (giving up)', {
    url: API_BASE,
    path: SOCKET_IO_PATH,
  });
}

let handlers: {
  onConnect: () => void;
  onDisconnect: (reason: string) => void;
  onConnectError: (err: Error) => void;
} | null = null;

function attachSocketListeners(s: Socket): void {
  handlers = {
    onConnect: () => {
      const transport = s.io.engine?.transport?.name ?? 'unknown';
      console.log('[socket] connected', s.id);
      console.log('[batman-socket] connected', {
        id: s.id,
        connected: s.connected,
        transport,
      });
      notifyConnection(true);
    },
    onDisconnect: (reason: string) => {
      console.log('[batman-socket] disconnected', {
        reason,
        url: API_BASE,
        path: SOCKET_IO_PATH,
      });
      notifyConnection(false);
    },
    onConnectError: (err: Error) => {
      console.warn('[batman-socket] connect_error', {
        message: err?.message,
        url: API_BASE,
        path: SOCKET_IO_PATH,
      });
      notifyConnection(false);
    },
  };

  s.on('connect', handlers.onConnect);
  s.on('disconnect', handlers.onDisconnect);
  s.on('connect_error', handlers.onConnectError);

  const mgr = s.io;
  mgr.on('reconnect_attempt', onReconnectAttempt);
  mgr.on('reconnect', onManagerReconnect);
  mgr.on('reconnect_error', onReconnectError);
  mgr.on('reconnect_failed', onReconnectFailed);

  // Engine opened: reflect connected state even if Socket `connect` was missed (e.g. listener timing).
  mgr.engine?.on('open', onEngineOpen);
}

function detachSocketListeners(s: Socket): void {
  if (handlers) {
    s.off('connect', handlers.onConnect);
    s.off('disconnect', handlers.onDisconnect);
    s.off('connect_error', handlers.onConnectError);
  }
  const mgr = s.io;
  mgr.off('reconnect_attempt', onReconnectAttempt);
  mgr.off('reconnect', onManagerReconnect);
  mgr.off('reconnect_error', onReconnectError);
  mgr.off('reconnect_failed', onReconnectFailed);
  mgr.engine?.off('open', onEngineOpen);
}

export function getSocket(): Socket | null {
  return socket;
}

/**
 * Single shared Socket.IO client to the Batman backend (mirrors angel-app transport options).
 */
export function connectSocket(): Socket | null {
  if (socket?.connected) {
    syncConnectionFromSocket();
    queueMicrotask(() => syncConnectionFromSocket());
    return socket;
  }

  if (socket) {
    socket.connect();
    queueMicrotask(() => syncConnectionFromSocket());
    return socket;
  }

  console.log('[batman-socket] initializing client', {
    url: API_BASE,
    path: SOCKET_IO_PATH,
    transports: ['websocket', 'polling'],
  });

  socket = io(API_BASE, {
    path: SOCKET_IO_PATH,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 15000,
    timeout: 25000,
  });

  attachSocketListeners(socket);

  // If the handshake already finished synchronously or before UI subscribed, push current state.
  syncConnectionFromSocket();
  queueMicrotask(() => syncConnectionFromSocket());

  return socket;
}

export function disconnectSocket(): void {
  if (!socket) return;
  detachSocketListeners(socket);
  socket.disconnect();
  socket = null;
  notifyConnection(false);
  console.log('[batman-socket] client torn down', { url: API_BASE, path: SOCKET_IO_PATH });
}
