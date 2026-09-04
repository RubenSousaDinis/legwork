// TEMPORARY (T-05) — deleted by T-24 once the API's /idkit/* routes exist
//
// Mirrors `idkitVerify` in packages/shared/src/api-contract.ts:
//   POST /idkit/verify · public · <IDKit result, forwarded as-is> -> { verified: true, nullifier, level }
// The probe adds one field the contract does not have, `world_response`, so the operator can
// paste World's raw payload shape into docs/spikes/RESULTS.md §S2. It disappears with this
// route in T-24. No cookie, no database, no attestation — that is all T-24's.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WORLD_VERIFY_BASE = 'https://developer.world.org/api/v4/verify';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'invalid_request', field: 'body', reason: 'body is not JSON' }, 400);
  }

  const rpId = process.env.WORLD_RP_ID;
  if (!rpId) {
    return json({ error: 'bad_state', detail: 'WORLD_RP_ID is not set on the server' }, 500);
  }

  // A legacy (v3) result carries the app it was produced for. If it is present it must be
  // ours: the app id is checked on the server, never trusted from the client.
  const claimedAppId = (payload as { app_id?: unknown } | null)?.app_id;
  const appId = process.env.WORLD_APP_ID;
  if (typeof claimedAppId === 'string' && appId && claimedAppId !== appId) {
    return json({ error: 'invalid_request', field: 'app_id', reason: 'app_id is not this app' }, 400);
  }

  // The IDKit result is forwarded byte-for-byte; nothing is added, removed or re-shaped.
  const worldResponse = await fetch(`${WORLD_VERIFY_BASE}/${rpId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await worldResponse.text();
  let world: unknown = null;
  if (text) {
    try {
      world = JSON.parse(text);
    } catch {
      world = text;
    }
  }

  if (!worldResponse.ok) return json(world, worldResponse.status);

  const record = (world ?? {}) as Record<string, unknown>;

  return json(
    {
      verified: true,
      nullifier: String(record.nullifier_hash ?? record.nullifier ?? ''),
      level: String(record.verification_level ?? record.level ?? ''),
      // probe-only: the exact shape and level string the operator records for spike S2'.
      world_response: world,
    },
    200,
  );
}
