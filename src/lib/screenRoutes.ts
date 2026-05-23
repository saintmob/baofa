import { SHOW_BACKEND_URL } from './runtimeConfig';

const env = (import.meta as any).env || {};
const controlToken = String(env.VITE_CONTROL_TOKEN || '');

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

export async function fetchScreenState(signal?: AbortSignal): Promise<{
  routes: Record<string, ScreenRoute>;
  presentation: ScreenPresentation;
}> {
  const headers: Record<string, string> = {};
  if (controlToken) headers['x-control-token'] = controlToken;
  const response = await fetch(`${SHOW_BACKEND_URL}/api/state`, { headers, signal });
  if (!response.ok) throw new Error(`Show API state failed: ${response.status}`);
  const state = await response.json();
  const presentation = state?.modules?.interaction?.screenPresentation || {};
  return {
    routes: state?.modules?.interaction?.screenRoutes || {},
    presentation: {
      autoRedirect: typeof presentation.autoRedirect === 'boolean' ? presentation.autoRedirect : true,
      showDebug: typeof presentation.showDebug === 'boolean' ? presentation.showDebug : false,
      showMenu: typeof presentation.showMenu === 'boolean' ? presentation.showMenu : false,
    },
  };
}

export async function fetchScreenRoutes(signal?: AbortSignal): Promise<Record<string, ScreenRoute>> {
  const state = await fetchScreenState(signal);
  return state.routes;
}
