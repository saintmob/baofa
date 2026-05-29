const env = (import.meta as any).env || {};
const lanHost = String(env.VITE_LAN_HOST || '').trim();
const RUNTIME_SETTINGS_KEY = 'vad.showRuntimeSettings.v1';

export const APP_PORT = 4303;

export type ShowTransport = 'websocket' | 'firebase' | 'cloudflare' | 'auto';

export type ShowRuntimeSettings = {
  transport: ShowTransport;
  backendUrl: string;
  wsUrl: string;
  showId: string;
  controlToken: string;
  clientId: string;
  firebaseDatabaseUrl: string;
};

const HOSTED_DEFAULTS: ShowRuntimeSettings = {
  transport: 'auto',
  backendUrl: 'https://vad-26-api.vercel.app',
  wsUrl: '',
  showId: 'show-main',
  controlToken: '',
  clientId: '',
  firebaseDatabaseUrl: 'https://vad-gafa-26-default-rtdb.asia-southeast1.firebasedatabase.app',
};

const VALID_TRANSPORTS = new Set<ShowTransport>(['websocket', 'firebase', 'cloudflare', 'auto']);

function getBrowserHost() {
  return typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
}

function getBrowserProtocol() {
  return typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'https:' : 'http:';
}

function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
}

function isLocalRuntime() {
  return isLocalHost(getBrowserHost());
}

function resolveHttpOrigin(port: number) {
  return `${getBrowserProtocol()}//${lanHost || getBrowserHost()}:${port}`;
}

function resolveWsOrigin(port: number) {
  return `${getBrowserProtocol() === 'https:' ? 'wss' : 'ws'}://${lanHost || getBrowserHost()}:${port}`;
}

function localDefaults(): ShowRuntimeSettings {
  return {
    ...HOSTED_DEFAULTS,
    backendUrl: resolveHttpOrigin(4300),
    wsUrl: `${resolveWsOrigin(4300)}/ws`,
  };
}

function baseDefaults(): ShowRuntimeSettings {
  return isLocalRuntime() ? localDefaults() : HOSTED_DEFAULTS;
}

function normalizeRuntimeUrl(value: string | undefined) {
  const trimmed = String(value || '').trim();
  return trimmed ? trimmed.replace(/\/$/, '') : '';
}

function parseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function usesStandardPort(url: URL) {
  return !url.port || url.port === '80' || url.port === '443';
}

function isUsableHttpOrigin(value: string) {
  const url = parseUrl(value);
  if (!url || !['http:', 'https:'].includes(url.protocol)) return false;
  if (isLocalRuntime()) return true;
  return !isLocalHost(url.hostname) && usesStandardPort(url);
}

function isUsableWebSocketEndpoint(value: string) {
  const url = parseUrl(value);
  if (!url || !['ws:', 'wss:'].includes(url.protocol)) return false;
  if (isLocalRuntime()) return true;
  return url.protocol === 'wss:' && !isLocalHost(url.hostname) && usesStandardPort(url);
}

function chooseUrl(value: string | undefined, fallback: string, isUsable: (url: string) => boolean) {
  const normalized = normalizeRuntimeUrl(value);
  return normalized && isUsable(normalized) ? normalized : fallback;
}

function chooseTransport(value: unknown, fallback: ShowTransport): ShowTransport {
  return VALID_TRANSPORTS.has(value as ShowTransport) ? value as ShowTransport : fallback;
}

export function loadShowRuntimeSettings(): ShowRuntimeSettings {
  const profile = baseDefaults();
  const defaults: ShowRuntimeSettings = {
    transport: chooseTransport(env.VITE_SHOW_TRANSPORT, profile.transport),
    backendUrl: chooseUrl(env.VITE_SHOW_BACKEND_URL, profile.backendUrl, isUsableHttpOrigin),
    wsUrl: chooseUrl(env.VITE_SHOW_WS_URL, profile.wsUrl, isUsableWebSocketEndpoint),
    showId: String(env.VITE_SHOW_ID || profile.showId),
    controlToken: String(env.VITE_CONTROL_TOKEN || profile.controlToken),
    clientId: String(env.VITE_SHOW_CLIENT_ID || profile.clientId),
    firebaseDatabaseUrl: chooseUrl(env.VITE_FIREBASE_DATABASE_URL, profile.firebaseDatabaseUrl, isUsableHttpOrigin),
  };
  if (typeof window === 'undefined') return defaults;
  try {
    const stored = JSON.parse(window.localStorage.getItem(RUNTIME_SETTINGS_KEY) || '{}') as Partial<ShowRuntimeSettings>;
    return {
      ...defaults,
      ...stored,
      backendUrl: chooseUrl(stored.backendUrl, defaults.backendUrl, isUsableHttpOrigin),
      wsUrl: chooseUrl(stored.wsUrl, defaults.wsUrl, isUsableWebSocketEndpoint),
      firebaseDatabaseUrl: chooseUrl(stored.firebaseDatabaseUrl, defaults.firebaseDatabaseUrl, isUsableHttpOrigin),
      transport: chooseTransport(stored.transport, defaults.transport),
    };
  } catch {
    return defaults;
  }
}

export function saveShowRuntimeSettings(settings: ShowRuntimeSettings) {
  window.localStorage.setItem(RUNTIME_SETTINGS_KEY, JSON.stringify({
    ...settings,
    backendUrl: normalizeRuntimeUrl(settings.backendUrl),
    wsUrl: normalizeRuntimeUrl(settings.wsUrl),
    firebaseDatabaseUrl: normalizeRuntimeUrl(settings.firebaseDatabaseUrl),
  }));
}

const runtimeSettings = loadShowRuntimeSettings();

export const SHOW_BACKEND_URL = runtimeSettings.backendUrl;
export const SHOW_WS_URL = runtimeSettings.wsUrl;
export const SHOW_TRANSPORT = runtimeSettings.transport;
export const SHOW_ID = runtimeSettings.showId;
export const SHOW_CONTROL_TOKEN = runtimeSettings.controlToken;
export const SHOW_CLIENT_ID = runtimeSettings.clientId;
export const FIREBASE_DATABASE_URL = runtimeSettings.firebaseDatabaseUrl;

export const BAOFA_NATIVE_URL = chooseUrl(env.VITE_BAOFA_NATIVE_URL, isLocalRuntime() ? resolveHttpOrigin(APP_PORT) : '', isUsableHttpOrigin);
