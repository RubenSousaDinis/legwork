// OWNER: T-35 — replace this file; do not edit from any other task
import { route, preflight } from '@/src/http/route';
import { buildOpenApi } from '@/src/openapi';

export const runtime = 'nodejs';
/**
 * The document is a pure function of the contract and `API_BASE_URL`, so it is the same bytes
 * for the whole life of a deployment. Serving it statically is what lets the Bazantic gateway
 * re-import it as often as it likes without touching the database.
 */
export const dynamic = 'force-static';

/**
 * `GET /openapi.json` — the OpenAPI 3.1 document, generated from `packages/shared`'s
 * `api-contract.ts`. Admin routes are absent by default: they are operator-only and a gateway
 * must not list them.
 */
export const GET = route(async () => {
  const document = buildOpenApi({ serverUrl: process.env.API_BASE_URL! });
  return new Response(JSON.stringify(document), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
});

export const OPTIONS = preflight;
