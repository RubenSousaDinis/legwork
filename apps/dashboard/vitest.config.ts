import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `tsconfig.json` sets `jsx: preserve` so that Next owns the JSX transform; vitest
 * goes through esbuild instead and has to be told the transform explicitly.
 */
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url).href).replace(/\/$/, '') },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    // `e2e/` is T-39's Playwright suite and is never run by vitest.
    exclude: ['node_modules/**', '.next/**', 'e2e/**'],
    restoreMocks: true,
  },
});
