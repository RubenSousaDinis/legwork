/**
 * Which app, which action, which RP, which credential level, which environment — and
 * nothing else.
 *
 * The five keys are written out as a literal rather than spread out of `getConfig()`: a
 * spread is one refactor away from putting the RP signing key on a public endpoint, and
 * this is the endpoint a client fetches before it has any session at all.
 */
import { route, preflight } from '@/src/http/route';
import { getConfig } from '@/src/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const config = getConfig();
  return Response.json(
    {
      app_id: config.WORLD_APP_ID,
      action: config.WORLD_ACTION,
      rp_id: config.WORLD_RP_ID,
      credential_level: config.WORLD_CREDENTIAL_LEVEL,
      env: config.WORLD_ENV,
    },
    { headers: { 'cache-control': 'public, max-age=60' } },
  );
});

export const OPTIONS = preflight;
