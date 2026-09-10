import { route, preflight } from '@/src/http/route';
import { getConfig } from '@/src/config';
import { rawQuery } from '@/src/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Liveness plus the four facts an operator asks first. No address derived from a key is ever
 * in here: `healthz` is public, and the relayer's address is a standing invitation to grief
 * the float.
 *
 * **Never cached.** Every other public read here is allowed to be served stale rather than
 * fail; this one is the thing you ask when you suspect the others are lying, so a shared cache
 * answering it from a warmer minute would defeat its only purpose.
 *
 * `ok` follows the database. It used to be the literal `true` beside a `db` field that could
 * read `"error"`, so on 2026-09-10, with the connection pool empty and every query failing,
 * this endpoint answered `{"ok": true, "db": "error"}` — and anything watching `ok` called
 * that healthy.
 */
export const GET = route(async () => {
  const config = getConfig();
  let db: 'ok' | 'error' = 'ok';
  try {
    await rawQuery('select 1');
  } catch {
    db = 'error';
  }
  return Response.json(
    {
      ok: db === 'ok',
      db,
      chain_id: config.CHAIN_ID,
      payment_mode: config.PAYMENT_MODE,
      data_mode: config.DATA_MODE,
      version: config.version,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
});

export const OPTIONS = preflight;
