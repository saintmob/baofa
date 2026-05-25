const env = (import.meta as any).env || {};
const lanHost = String(env.VITE_LAN_HOST || env.SHOW_LAN_HOST || '').trim();

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

export const APP_PORT = 4303;
export const SHOW_BACKEND_URL = resolveConfiguredUrl(env.VITE_SHOW_BACKEND_URL, resolveHttpOrigin(4300));
export const SHOW_WS_URL = resolveConfiguredUrl(env.VITE_SHOW_WS_URL, `${resolveWsOrigin(4300)}/ws`);

export const BAOFA_NATIVE_URL = resolveConfiguredUrl(env.VITE_BAOFA_NATIVE_URL, resolveHttpOrigin(APP_PORT));
