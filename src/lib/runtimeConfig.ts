const env = (import.meta as any).env || {};
const lanHost = String(env.VITE_LAN_HOST || env.SHOW_LAN_HOST || '').trim();

export type AccessScope = 'local' | 'lan';
export type ScreenOwner = 'vj' | 'baofa' | 'off' | 'diagnostic';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

function getBrowserHost() {
  return typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
}

function getBrowserProtocol() {
  return typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'https:' : 'http:';
}

function isLocalAddress(value: string) {
  return /(^|\/\/)localhost(?::|\/|$)|(^|\/\/)127\.0\.0\.1(?::|\/|$)|(^|\/\/)0\.0\.0\.0(?::|\/|$)/i.test(value);
}

export function isLoopbackHost(value: string) {
  return LOOPBACK_HOSTS.has(String(value || '').trim().toLowerCase());
}

export function getAccessScope(host = getBrowserHost()): AccessScope {
  return isLoopbackHost(host) ? 'local' : 'lan';
}

export function getAccessOrigin(port: number) {
  return `${getBrowserProtocol()}//${getBrowserHost()}:${port}`;
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
export const VJ_SCREEN_BASE_URL = resolveConfiguredUrl(
  env.VITE_VJ_SCREEN_BASE_URL,
  `${resolveHttpOrigin(4302)}/screen`,
);

export function getVjScreenUrl(screenId: string) {
  return `${getAccessOrigin(4302)}/screen/${encodeURIComponent(screenId)}`;
}

export function getBaofaScreenUrl(screenId: string) {
  return `${getAccessOrigin(APP_PORT)}/screen/${encodeURIComponent(screenId)}`;
}

export function getScreenUrlForOwner(owner: ScreenOwner, screenId: string) {
  if (owner === 'vj') return getVjScreenUrl(screenId);
  if (owner === 'baofa') return getBaofaScreenUrl(screenId);
  return null;
}
