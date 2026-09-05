import { route, preflight } from '@/src/http/route';
import { getConfig } from '@/src/config';
import { rawQuery } from '@/src/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Liveness plus the four facts an operator asks first. No address derived from a key is ever
 * in here: `healthz` is public, and the relayer's address is a standing invitation to grief
 * the float.
 */
export const GET = route(async () => {
  const config = getConfig();
  let db: 'ok' | 'error' = 'ok';
  try {
    await rawQuery('select 1');
  } catch {
    db = 'error';
  }
  return Response.json({
    ok: true,
    db,
    chain_id: config.CHAIN_ID,
    payment_mode: config.PAYMENT_MODE,
    data_mode: config.DATA_MODE,
    version: config.version,
  });
});

export const OPTIONS = preflight;
