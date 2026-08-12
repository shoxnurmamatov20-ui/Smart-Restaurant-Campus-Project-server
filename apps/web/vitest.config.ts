import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * There was no config here at all until now: the `test` script ran vitest on
 * defaults, so `jsdom` and `@testing-library/react` sat in package.json as
 * dependencies nothing could actually use — any test that rendered a component
 * would have failed on a missing `document`.
 *
 * Vitest transforms TSX through esbuild using the `jsx` and `jsxImportSource`
 * settings below, which is all a test run needs; the React vite plugin only
 * adds Fast Refresh, which no test wants.
 */
export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
