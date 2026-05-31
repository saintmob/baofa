import { FIREBASE_DATABASE_URL, SHOW_BACKEND_URL, SHOW_CONTROL_TOKEN, SHOW_ID, SHOW_TRANSPORT, SHOW_WS_URL } from './runtimeConfig';

const controlToken = SHOW_CONTROL_TOKEN;
const databaseUrl = FIREBASE_DATABASE_URL;
const showId = SHOW_ID;

export type ScreenOwner = 'vj' | 'baofa' | 'off' | 'diagnostic';

export type ScreenRoute = {
  screenId: string;
  owner: ScreenOwner;
  url: string | null;
  updatedAt?: number;
  status?: string;
  source?: string;
};

export type ScreenPresentation = {
  autoRedirect: boolean;
  showDebug: boolean;
  showMenu: boolean;
};

export type ClientPresence = {
  id: string;
  module?: string;
  role?: string;
  status?: string;
  screenId?: string;
};

export async function fetchScreenState(signal?: AbortSignal): Promise<{
  routes: Record<string, ScreenRoute>;
  presentation: ScreenPresentation;
  clients: Record<string, ClientPresence>;
}> {
  if (!controlToken.trim()) throw new Error('Control token is required');
  if (shouldReadFirebaseState()) {
    const [state, clients] = await Promise.all([
      fetchFirebaseJson(`shows/${safePath(showId)}/state`, signal),
      fetchFirebaseJson(`shows/${safePath(showId)}/clients`, signal),
    ]);
    return normalizeScreenState(state, clients || {});
  }
  const state = await fetchBackendState(signal);
  return normalizeScreenState(state, state?.clients || {});
}

async function fetchBackendState(signal?: AbortSignal) {
  const headers: Record<string, string> = {};
  if (controlToken) headers['x-control-token'] = controlToken;
  const response = await fetch(withRoom(`${SHOW_BACKEND_URL}/api/state`), { headers, signal });
  if (!response.ok) throw new Error(`Show API state failed: ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) throw new Error(`Show API state returned ${contentType || 'non-json content'}`);
  return response.json();
}

async function fetchFirebaseJson(path: string, signal?: AbortSignal) {
  const response = await fetch(firebaseJsonUrl(path), { signal });
  if (!response.ok) throw new Error(`Firebase ${path} failed: ${response.status}`);
  return response.json();
}

function normalizeScreenState(state: any, clients: Record<string, ClientPresence>) {
  const presentation = state?.modules?.interaction?.screenPresentation || {};
  return {
    routes: state?.modules?.interaction?.screenRoutes || {},
    presentation: {
      autoRedirect: typeof presentation.autoRedirect === 'boolean' ? presentation.autoRedirect : true,
      showDebug: typeof presentation.showDebug === 'boolean' ? presentation.showDebug : true,
      showMenu: typeof presentation.showMenu === 'boolean' ? presentation.showMenu : true,
    },
    clients,
  };
}

function shouldReadFirebaseState() {
  if (!databaseUrl) return false;
  if (SHOW_TRANSPORT === 'firebase') return true;
  if (SHOW_TRANSPORT === 'websocket' || SHOW_TRANSPORT === 'cloudflare') return !isUsableWebSocketUrl();
  return !isUsableWebSocketUrl();
}

function isUsableWebSocketUrl() {
  if (!SHOW_WS_URL) return false;
  try {
    const url = new URL(SHOW_WS_URL);
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

function firebaseJsonUrl(path: string) {
  return `${databaseUrl}/${path}.json`;
}

function withRoom(url: string) {
  const next = new URL(url);
  if (showId) next.searchParams.set('room', showId);
  return next.toString();
}

function safePath(value: string) {
  return value.replace(/[.#$/[\]]/g, '-');
}

export async function fetchScreenRoutes(signal?: AbortSignal): Promise<Record<string, ScreenRoute>> {
  const state = await fetchScreenState(signal);
  return state.routes;
}
