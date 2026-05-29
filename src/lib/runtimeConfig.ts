const env = (import.meta as any).env || {};
const lanHost = String(env.VITE_LAN_HOST || '').trim();
const RUNTIME_SETTINGS_KEY = 'vad.showRuntimeSettings.v1';

export type ShowRuntimeSettings = {
  transport: 'websocket' | 'firebase' | 'auto';
  backendUrl: string;
  wsUrl: string;
  showId: string;
  controlToken: string;
  clientId: string;
  firebaseDatabaseUrl: string;
};

function getBrowserHost() {
  return typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
}

function getBrowserProtocol() {
  return typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'https:' : 'http:';
}

function isLocalAddress(value: string) {
  return /(^|\/\/)localhost(?::|\/|$)|(^|\/\/)127\.0\.0\.1(?::|\/|$)|(^|\/\/)0\.0\.0\.0(?::|\/|$)/i.test(value);
}

function resolveHttpOrigin(port: number) {
  return `${getBrowserProtocol()}//${lanHost || getBrowserHost()}:${port}`;
}

function resolveWsOrigin(port: number) {
  return `${getBrowserProtocol() === 'https:' ? 'wss' : 'ws'}://${lanHost || getBrowserHost()}:${port}`;
}

function resolveConfiguredUrl(configured: string | undefined, fallback: string) {
  const value = String(configured || '').trim();
  return value && !isLocalAddress(value) ? value.replace(/\/$/, '') : fallback;
}

function normalizeRuntimeUrl(value: string | undefined) {
  const trimmed = String(value || '').trim();
  return trimmed ? trimmed.replace(/\/$/, '') : '';
}

export function loadShowRuntimeSettings(): ShowRuntimeSettings {
  const defaults: ShowRuntimeSettings = {
    transport: (env.VITE_SHOW_TRANSPORT || 'websocket') as ShowRuntimeSettings['transport'],
    backendUrl: resolveConfiguredUrl(env.VITE_SHOW_BACKEND_URL, resolveHttpOrigin(4300)),
    wsUrl: resolveConfiguredUrl(env.VITE_SHOW_WS_URL, `${resolveWsOrigin(4300)}/ws`),
    showId: String(env.VITE_SHOW_ID || 'show-main'),
    controlToken: String(env.VITE_CONTROL_TOKEN || ''),
    clientId: String(env.VITE_SHOW_CLIENT_ID || ''),
    firebaseDatabaseUrl: String(env.VITE_FIREBASE_DATABASE_URL || '').replace(/\/$/, ''),
  };
  if (typeof window === 'undefined') return defaults;
  try {
    const stored = JSON.parse(window.localStorage.getItem(RUNTIME_SETTINGS_KEY) || '{}') as Partial<ShowRuntimeSettings>;
    return {
      ...defaults,
      ...stored,
      backendUrl: normalizeRuntimeUrl(stored.backendUrl) || defaults.backendUrl,
      wsUrl: normalizeRuntimeUrl(stored.wsUrl) || defaults.wsUrl,
      firebaseDatabaseUrl: normalizeRuntimeUrl(stored.firebaseDatabaseUrl) || defaults.firebaseDatabaseUrl,
      transport: ['websocket', 'firebase', 'auto'].includes(String(stored.transport)) ? stored.transport as ShowRuntimeSettings['transport'] : defaults.transport,
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

export const APP_PORT = 4303;
export const SHOW_BACKEND_URL = runtimeSettings.backendUrl;
export const SHOW_WS_URL = runtimeSettings.wsUrl;
export const SHOW_TRANSPORT = runtimeSettings.transport;
export const SHOW_ID = runtimeSettings.showId;
export const SHOW_CONTROL_TOKEN = runtimeSettings.controlToken;
export const SHOW_CLIENT_ID = runtimeSettings.clientId;
export const FIREBASE_DATABASE_URL = runtimeSettings.firebaseDatabaseUrl;

export const BAOFA_NATIVE_URL = resolveConfiguredUrl(env.VITE_BAOFA_NATIVE_URL, resolveHttpOrigin(APP_PORT));
