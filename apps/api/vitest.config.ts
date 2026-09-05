import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { '@': root } },
  test: {
    environment: 'node',
    // pglite boots a Postgres WebAssembly image on first use; on a cold CI runner that alone
    // can outlast the 5 s default.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
