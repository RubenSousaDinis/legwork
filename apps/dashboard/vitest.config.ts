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
    /**
     * The suite reads the same environment the pages do, so an operator shell that exports
     * `DATA_MODE=live` (to present the live site) turned twelve tests red locally while CI,
     * which exports neither, stayed green — `PoolChip` took its async live branch inside
     * jsdom and every page asserting demo copy failed with it. Pinned here so `pnpm test`
     * answers the same question on every machine. A test that wants another value still
     * stubs it: `dashboardLockedCopyFollowsTheCredential` sets both levels itself.
     */
    env: {
      DATA_MODE: 'demo',
      WORLD_CREDENTIAL_LEVEL: 'orb',
      NEXT_PUBLIC_WORLD_CREDENTIAL_LEVEL: 'orb',
    },
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    // `e2e/` is T-39's Playwright suite and is never run by vitest.
    exclude: ['node_modules/**', '.next/**', 'e2e/**'],
    restoreMocks: true,
  },
});
