import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // pglite boots a Postgres WebAssembly image on first use; on a cold CI runner that alone
    // can outlast the 5 s default.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
