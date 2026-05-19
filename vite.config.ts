import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Adds a browser-side guard for Google AI Studio Build preview sessions.
 *
 * Detection:
 * - Auto-enables when both signals are present:
 *   1. GEMINI_API_KEY exists
 *   2. DISABLE_HMR=true
 *
 * Why both:
 * - GEMINI_API_KEY alone is common in local Gemini projects.
 * - DISABLE_HMR=true alone may be used by hosted preview systems.
 * - Together they are a more specific signal for the AI Studio Build template.
 *
 * What it does:
 * - Keeps the real Vite dev client available so AI Studio startup is not broken.
 * - Prevents Vite's reconnect polling endpoint (`/__vite_ping`) from succeeding
 *   in the browser, so a temporary server disconnect does not turn into a
 *   Vite-driven page reload.
 * - Leaves normal local HMR untouched when the AI Studio signals are absent.
 */
function aiStudioNoAutoreloadGuard(): Plugin {
  const guardScript = `
    (() => {
      if (window.__AI_STUDIO_NO_AUTORELOAD_GUARD__) return;
      window.__AI_STUDIO_NO_AUTORELOAD_GUARD__ = true;

      const originalFetch = window.fetch.bind(window);

      function isVitePing(input) {
        try {
          const rawUrl =
            typeof input === 'string'
              ? input
              : input && typeof input === 'object' && 'url' in input
                ? input.url
                : '';

          const url = new URL(rawUrl, window.location.href);
          return url.pathname.endsWith('/__vite_ping');
        } catch {
          return false;
        }
      }

      window.fetch = function patchedFetch(input, init) {
        if (isVitePing(input)) {
          // Vite calls /__vite_ping while waiting for the dev server to come back.
          // If the ping succeeds, Vite reloads the page. Keep it pending instead.
          return new Promise(() => {});
        }

        return originalFetch(input, init);
      };
    })();
  `;

  return {
    name: 'ai-studio-no-autoreload-guard',
    apply: 'serve',
    enforce: 'pre',

    transformIndexHtml: {
      order: 'pre',
      handler() {
        return [
          {
            tag: 'script',
            attrs: { type: 'module' },
            children: guardScript,
            injectTo: 'head-prepend',
          },
        ];
      },
    },
  };
}

function isTrue(value: unknown): boolean {
  return value === 'true' || value === '1';
}

function isFalse(value: unknown): boolean {
  return value === 'false' || value === '0';
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const hasGeminiApiKey = Boolean(
    env.GEMINI_API_KEY || process.env.GEMINI_API_KEY,
  );

  const disableHmrRequested =
    isTrue(env.DISABLE_HMR) || isTrue(process.env.DISABLE_HMR);

  const explicitNoAutoreloadEnabled =
    isTrue(env.AI_STUDIO_NO_AUTORELOAD) ||
    isTrue(process.env.AI_STUDIO_NO_AUTORELOAD);

  const explicitNoAutoreloadDisabled =
    isFalse(env.AI_STUDIO_NO_AUTORELOAD) ||
    isFalse(process.env.AI_STUDIO_NO_AUTORELOAD);

  const autoDetectedAiStudioBuild = hasGeminiApiKey && disableHmrRequested;

  const enableAiStudioNoAutoreloadGuard =
    (autoDetectedAiStudioBuild || explicitNoAutoreloadEnabled) &&
    !explicitNoAutoreloadDisabled;

  const disableHmr = disableHmrRequested || enableAiStudioNoAutoreloadGuard;

  return {
    plugins: [
      ...(enableAiStudioNoAutoreloadGuard ? [aiStudioNoAutoreloadGuard()] : []),
      react(),
      tailwindcss(),
    ],

    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY ?? ''),
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,

      ...(disableHmr ? { hmr: false } : {}),

      ...(enableAiStudioNoAutoreloadGuard
        ? {
            watch: {
              ignored: [
                '**/.git/**',
                '**/node_modules/**',
                '**/dist/**',
                '**/.vite/**',
                '**/.cache/**',
                '**/*.log',
                '**/.aistudio/**',
                '**/.gemini/**',
              ],
            },
          }
        : {}),
    },
  };
});