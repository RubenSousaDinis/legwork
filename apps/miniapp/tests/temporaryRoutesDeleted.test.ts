import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `process.cwd()` is `apps/miniapp` under this vitest config. `import.meta.url` is not usable
 * here: jsdom's `URL` does not resolve a relative path against a `file:` base, so every lookup
 * would throw — or, worse, answer "missing" for a file that is right there.
 */
const at = (path: string) => resolve(process.cwd(), path);

describe('cleanup', () => {
  it('temporaryRoutesDeleted', () => {
    // The guard: if this one is false the paths are wrong and the rest proves nothing.
    expect(existsSync(at('lib/worldid.ts')), 'path resolution is broken').toBe(true);

    // T-05's temporary handlers shadowed the `/api` rewrite so the probe could reach a signing
    // key without an API. The real API serves both routes now, so they go.
    expect(existsSync(at('app/api/idkit'))).toBe(false);
    expect(existsSync(at('app/api/idkit/request/route.ts'))).toBe(false);
    expect(existsSync(at('app/api/idkit/verify/route.ts'))).toBe(false);

    expect(existsSync(at('lib/probeApi.ts'))).toBe(false);
  });
});
