import { defineConfig } from 'vitest/config';

/**
 * jsdom, pinned to the origin `lib/api.ts` builds its absolute URLs from, so msw sees the
 * same `http://localhost:3000/api/...` the phone would. The network is msw and nothing else.
 */
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost:3000' } },
    setupFiles: ['./mocks/server.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
