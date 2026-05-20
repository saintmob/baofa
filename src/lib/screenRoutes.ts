import { SHOW_BACKEND_URL } from './runtimeConfig';

export type ScreenOwner = 'vj' | 'baofa' | 'off' | 'diagnostic';

export type ScreenRoute = {
  screenId: string;
  owner: ScreenOwner;
  url: string | null;
  updatedAt?: number;
  status?: string;
  source?: string;
};

export async function fetchScreenRoutes(signal?: AbortSignal): Promise<Record<string, ScreenRoute>> {
  const response = await fetch(`${SHOW_BACKEND_URL}/api/state`, { signal });
  if (!response.ok) throw new Error(`Show API state failed: ${response.status}`);
  const state = await response.json();
  return state?.modules?.interaction?.screenRoutes || {};
}
