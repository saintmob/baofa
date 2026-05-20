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
  | { type: 'state.patch'; state: unknown }
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

const env = (import.meta as any).env || {};
const backendUrl = (env.VITE_SHOW_BACKEND_URL || 'http://localhost:4300').replace(/\/$/, '');
const wsUrl = env.VITE_SHOW_WS_URL || backendUrl.replace(/^http/, 'ws') + '/ws';
const controlToken = env.VITE_CONTROL_TOKEN || '';
const databaseUrl = String(env.VITE_FIREBASE_DATABASE_URL || '').replace(/\/$/, '');
const showId = env.VITE_SHOW_ID || 'show-main';
const transport = env.VITE_SHOW_TRANSPORT || 'auto';

export function createShowControlClient(options: ClientOptions) {
  if (shouldUseFirebase()) return createFirebaseClient(options);
  return createWebSocketClient(options);
}

function shouldUseFirebase() {
  if (transport === 'firebase') return Boolean(databaseUrl);
  if (transport === 'websocket') return false;
  return Boolean(databaseUrl) && backendUrl.includes('vercel.app');
}

function createWebSocketClient(options: ClientOptions) {
  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
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
      reconnectTimer = window.setTimeout(connect, 1200);
    });

    socket.addEventListener('error', () => {
      options.onStatus?.('offline');
    });
  };

  connect();

  return {
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
      [`state/modules/${options.module}`]: patch,
      'state/updatedAt': Date.now(),
      [`clients/${safePath(options.clientId)}/lastSeen`]: Date.now(),
    };
    if (options.module === 'audio' && typeof patch.bpm === 'number') updates['state/show/bpm'] = patch.bpm;
    await firebasePatch(rootPath, updates);
  };

  void connect();

  return {
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

function safePath(value: string) {
  return value.replace(/[.#$/[\]]/g, '-');
}
