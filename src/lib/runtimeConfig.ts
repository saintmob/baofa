export const APP_PORT = 4303;

export const SHOW_BACKEND_URL = 'http://localhost:4300';
export const SHOW_WS_URL = 'ws://localhost:4300/ws';

export const BAOFA_NATIVE_URL = `http://localhost:${APP_PORT}`;
export const VJ_SCREEN_BASE_URL = 'http://localhost:4302/screen';

export function getVjScreenUrl(screenId: string) {
  return `${VJ_SCREEN_BASE_URL}/${encodeURIComponent(screenId)}`;
}
