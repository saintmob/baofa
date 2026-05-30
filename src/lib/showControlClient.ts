import { FIREBASE_DATABASE_URL, SHOW_BACKEND_URL, SHOW_CONTROL_TOKEN, SHOW_ID, SHOW_TRANSPORT, SHOW_WS_URL } from './runtimeConfig';

export type ModuleName = 'audio' | 'visual' | 'interaction';

export type ControlCommand = {
  type?: 'control.command';
  id?: string;
  module?: ModuleName | 'show';
  target: string;
  command: string;
  value?: unknown;
  issuedBy?: string;
  timestamp?: number;
  token?: string;
};

type ServerMessage =
  | { type: 'state.snapshot'; state: unknown }
  | { type: 'state.patch'; module: ModuleName; patch: Record<string, unknown>; updatedAt?: number }
  | { type: 'show.patch'; patch: Record<string, unknown>; updatedAt?: number }
  | ControlCommand
  | { type: 'control.ack'; ok: boolean; command: ControlCommand }
  | { type: 'error'; error: string }
  | Record<string, unknown>;

type ClientOptions = {
  module: ModuleName;
  clientId: string;
  role: string;
  capabilities?: string[];
  onCommand?: (command: ControlCommand) => void;
  onStatus?: (status: 'connecting' | 'connected' | 'offline') => void;
  onError?: (message: string) => void;
};

const backendUrl = SHOW_BACKEND_URL.replace(/\/$/, '');
const wsUrl = SHOW_WS_URL.replace(/\/$/, '');
const controlToken = SHOW_CONTROL_TOKEN;
const databaseUrl = FIREBASE_DATABASE_URL;
const showId = SHOW_ID;
const transport = SHOW_TRANSPORT;

function createCommandId(prefix: string) {
  const fragment = globalThis.crypto?.randomUUID?.()?.slice(0, 8) || Math.random().toString(36).slice(2, 10);
  return `${prefix}-${fragment}`;
}

export function createShowControlClient(options: ClientOptions) {
  if (!controlToken.trim()) {
    options.onStatus?.('offline');
    options.onError?.('Control token is required before show control can connect');
    return createDisabledClient();
  }
  if (!isUsableWebSocketUrl() && (transport === 'websocket' || transport === 'cloudflare') && databaseUrl) {
    options.onError?.(`WebSocket URL ${wsUrl || '(empty)'} is not usable from this page; falling back to Firebase`);
    return createFirebaseClient(options);
  }
  if (shouldUseFirebase()) return createFirebaseClient(options);
  return createWebSocketClient(options);
}

function createDisabledClient() {
  return {
    sendCommand() {
      return;
    },
    publishState() {
      return;
    },
    async postState() {
      throw new Error('Control token is required');
    },
    close() {
      return;
    },
  };
}

function shouldUseFirebase() {
  if (transport === 'firebase') return Boolean(databaseUrl);
  if (transport === 'websocket' || transport === 'cloudflare') return !isUsableWebSocketUrl() && Boolean(databaseUrl);
  if (isUsableWebSocketUrl()) return false;
  return Boolean(databaseUrl);
}

function isUsableWebSocketUrl() {
  if (!wsUrl) return false;
  try {
    const url = new URL(wsUrl);
    if (!['ws:', 'wss:'].includes(url.protocol)) return false;
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.protocol === 'ws:') return false;
    const localHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
    if (typeof window !== 'undefined' && !localHosts.has(window.location.hostname) && localHosts.has(url.hostname)) return false;
    if (url.hostname.endsWith('vercel.app')) return false;
    return true;
  } catch {
    return false;
  }
}

function createWebSocketClient(options: ClientOptions) {
  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let heartbeatTimer: number | null = null;
  let closed = false;
  let lastPatch = '';
  let pendingPatch: Record<string, unknown> | null = null;

  const send = (message: Record<string, unknown>) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(controlToken ? { ...message, token: controlToken } : message));
    }
  };

  const connect = () => {
    if (closed) return;
    options.onStatus?.('connecting');
    socket = new WebSocket(controlToken ? `${wsUrl}${wsUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(controlToken)}` : wsUrl);

    socket.addEventListener('open', () => {
      options.onStatus?.('connected');
      send({
        type: 'client.hello',
        clientId: options.clientId,
        module: options.module,
        role: options.role,
        capabilities: options.capabilities || [],
      });
      if (pendingPatch) {
        send({ type: 'module.statePatch', module: options.module, source: options.clientId, patch: pendingPatch });
      }
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      heartbeatTimer = window.setInterval(() => {
        send({ type: 'heartbeat', clientId: options.clientId, sentAt: Date.now() });
      }, 10_000);
    });

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type === 'control.command') {
        options.onCommand?.(message as ControlCommand);
      } else if (message.type === 'error') {
        options.onError?.(String(message.error));
      }
    });

    socket.addEventListener('close', () => {
      if (closed) return;
      options.onStatus?.('offline');
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      reconnectTimer = window.setTimeout(connect, 1200);
    });

    socket.addEventListener('error', () => {
      options.onStatus?.('offline');
    });
  };

  connect();

  return {
    sendCommand(command: ControlCommand) {
      send({
        ...command,
        type: 'control.command',
        id: command.id || createCommandId(options.clientId),
        module: command.module || options.module,
        issuedBy: command.issuedBy || options.clientId,
      });
    },
    publishState(patch: Record<string, unknown>) {
      const encoded = JSON.stringify(patch);
      if (encoded === lastPatch) return;
      lastPatch = encoded;
      pendingPatch = patch;
      send({ type: 'module.statePatch', module: options.module, source: options.clientId, patch });
    },
    async postState(patch: Record<string, unknown>) {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (controlToken) headers['x-control-token'] = controlToken;
      await fetch(`${backendUrl}/api/modules/${options.module}/state`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ source: options.clientId, patch }),
      });
    },
    close() {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      socket?.close();
    },
  };
}

function createFirebaseClient(options: ClientOptions) {
  const rootPath = `shows/${safePath(showId)}`;
  const connectedAt = Date.now() - 2000;
  const seenCommands = new Set<string>();
  const streams: EventSource[] = [];
  let closed = false;
  let lastPatch = '';
  let pendingPatch: Record<string, unknown> | null = null;

  const connect = async () => {
    if (closed) return;
    options.onStatus?.('connecting');
    try {
      await firebasePut(`${rootPath}/clients/${safePath(options.clientId)}`, makeClientInfo(options));
      streams.push(openStream(`${rootPath}/commands`, () => void loadCommands()));
      options.onStatus?.('connected');
      if (pendingPatch) await publishFirebasePatch(pendingPatch);
    } catch (error) {
      options.onStatus?.('offline');
      options.onError?.(error instanceof Error ? error.message : String(error));
    }
  };

  const loadCommands = async () => {
    if (closed) return;
    const commands = await firebaseGet<Record<string, ControlCommand>>(`${rootPath}/commands`).catch((error) => {
      options.onError?.(error instanceof Error ? error.message : String(error));
      return null;
    });
    if (!commands) return;

    Object.entries(commands)
      .map(([id, value]) => {
        const command = value as ControlCommand;
        return { ...command, id: command.id || id };
      })
      .filter((command) => Number(command.timestamp || 0) >= connectedAt)
      .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0))
      .forEach((command) => {
        const id = command.id || `${command.timestamp}-${command.command}`;
        if (seenCommands.has(id)) return;
        if (command.issuedBy === options.clientId) return;
        if (command.module && command.module !== options.module && command.module !== 'show') return;
        seenCommands.add(id);
        options.onCommand?.(command);
        void firebasePut(`${rootPath}/acks/${safePath(id)}/${safePath(options.clientId)}`, {
          ok: true,
          clientId: options.clientId,
          module: options.module,
          command: command.command,
          target: command.target,
          timestamp: Date.now(),
        });
      });
  };

  const publishFirebasePatch = async (patch: Record<string, unknown>) => {
    const updates: Record<string, unknown> = {
      [`modules/${options.module}`]: patch,
      'state/updatedAt': Date.now(),
      [`clients/${safePath(options.clientId)}/lastSeen`]: Date.now(),
    };
    Object.assign(updates, makeStateModuleUpdates(options.module, patch));
    if (options.module === 'audio' && typeof patch.bpm === 'number') updates['state/show/bpm'] = patch.bpm;
    await firebasePatch(rootPath, updates);
  };

  void connect();

  return {
    async sendCommand(command: ControlCommand) {
      const id = command.id || createCommandId(options.clientId);
      await firebasePut(`${rootPath}/commands/${safePath(id)}`, {
        ...command,
        type: 'control.command',
        id,
        module: command.module || options.module,
        issuedBy: command.issuedBy || options.clientId,
        timestamp: command.timestamp || Date.now(),
      });
    },
    publishState(patch: Record<string, unknown>) {
      const encoded = JSON.stringify(patch);
      if (encoded === lastPatch) return;
      lastPatch = encoded;
      pendingPatch = patch;
      void publishFirebasePatch(patch).catch((error) => {
        options.onStatus?.('offline');
        options.onError?.(error instanceof Error ? error.message : String(error));
      });
    },
    async postState(patch: Record<string, unknown>) {
      pendingPatch = patch;
      await publishFirebasePatch(patch);
    },
    close() {
      closed = true;
      streams.forEach((stream) => stream.close());
      void firebaseDelete(`${rootPath}/clients/${safePath(options.clientId)}`).catch(() => undefined);
    },
  };
}

function makeClientInfo(options: ClientOptions) {
  const now = Date.now();
  return {
    id: options.clientId,
    module: options.module,
    role: options.role,
    status: 'online',
    connectedAt: now,
    lastSeen: now,
    latency: null,
    capabilities: ['firebase.realtime', ...(options.capabilities || [])],
  };
}

function openStream(path: string, onRemoteChange: () => void) {
  const stream = new EventSource(jsonUrl(path));
  stream.addEventListener('open', onRemoteChange);
  stream.addEventListener('put', onRemoteChange);
  stream.addEventListener('patch', onRemoteChange);
  return stream;
}

async function firebaseGet<T>(path: string): Promise<T | null> {
  const response = await fetch(jsonUrl(path));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firebase GET ${path} failed: ${response.status}`);
  return response.json() as Promise<T | null>;
}

async function firebasePut(path: string, value: unknown) {
  await firebaseWrite('PUT', path, value);
}

async function firebasePatch(path: string, value: unknown) {
  await firebaseWrite('PATCH', path, value);
}

async function firebaseDelete(path: string) {
  const response = await fetch(jsonUrl(path), { method: 'DELETE' });
  if (!response.ok) throw new Error(`Firebase DELETE ${path} failed: ${response.status}`);
}

async function firebaseWrite(method: 'PUT' | 'PATCH', path: string, value: unknown) {
  const response = await fetch(jsonUrl(path), {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Firebase ${method} ${path} failed: ${response.status} ${text}`);
  }
}

function jsonUrl(path: string) {
  return `${databaseUrl}/${path}.json`;
}

function makeStateModuleUpdates(module: ModuleName, patch: Record<string, unknown>) {
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (module === 'interaction' && isControlOwnedInteractionField(key)) continue;
    updates[`state/modules/${module}/${safePath(key)}`] = value;
  }
  return updates;
}

function isControlOwnedInteractionField(key: string) {
  return ['screenRoutes', 'screenRoutePreset', 'screenPresentation', 'screenTopology', 'screenRegistry'].includes(key);
}

function safePath(value: string) {
  return value.replace(/[.#$/[\]]/g, '-');
}
