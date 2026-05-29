import { SHOW_BACKEND_URL, SHOW_CONTROL_TOKEN } from './runtimeConfig';

const controlToken = SHOW_CONTROL_TOKEN;

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
  const headers: Record<string, string> = {};
  if (controlToken) headers['x-control-token'] = controlToken;
  const response = await fetch(`${SHOW_BACKEND_URL}/api/state`, { headers, signal });
  if (!response.ok) throw new Error(`Show API state failed: ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) throw new Error(`Show API state returned ${contentType || 'non-json content'}`);
  const state = await response.json();
  const presentation = state?.modules?.interaction?.screenPresentation || {};
  return {
    routes: state?.modules?.interaction?.screenRoutes || {},
    presentation: {
      autoRedirect: typeof presentation.autoRedirect === 'boolean' ? presentation.autoRedirect : true,
      showDebug: typeof presentation.showDebug === 'boolean' ? presentation.showDebug : false,
      showMenu: typeof presentation.showMenu === 'boolean' ? presentation.showMenu : false,
    },
    clients: state?.clients || {},
  };
}

export async function fetchScreenRoutes(signal?: AbortSignal): Promise<Record<string, ScreenRoute>> {
  const state = await fetchScreenState(signal);
  return state.routes;
}
