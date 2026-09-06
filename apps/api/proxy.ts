/**
 * Next 16's `proxy` convention (the file it used to call `middleware`). Everything it does
 * lives in `src/middleware/edge.ts` (T-38): CORS allowlist → admin gate → body cap → rate
 * limit → pass through. This file exists because Next looks for it here and nowhere else.
 *
 * `config` has to be a literal in this file — Next reads it statically and refuses a
 * re-export — so it mirrors `edge.ts`'s `config`; `proxy.test.ts` pins the two together.
 */
import type { NextRequest } from 'next/server';
import { middleware } from './src/middleware/edge';

export function proxy(req: NextRequest) {
  return middleware(req);
}

/** Everything except Next's own asset routes — the same matcher as `src/middleware/edge.ts`. */
export const config = { matcher: ['/((?!_next|favicon.ico).*)'] };
