import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // pglite boots a Postgres WebAssembly image on first use; on a cold CI runner that alone
    // can outlast the 5 s default.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // One file at a time. `txqueue.test.ts` asserts that two 200 ms receipt waits overlap in
    // under 300 ms, and that measurement is only meaningful if nothing else is competing for
    // the event loop — pglite booting in a sibling worker turns a real 206 ms into 600 ms.
    fileParallelism: false,
  },
});
