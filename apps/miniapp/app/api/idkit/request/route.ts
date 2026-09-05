// TEMPORARY (T-05) — deleted by T-24 once the API's /idkit/* routes exist
//
// Mirrors `idkitRequest` in packages/shared/src/api-contract.ts:
//   POST /idkit/request · public · { action } -> { rp_context { rp_id, nonce, created_at, expires_at, signature } }
// It exists only so the S2' probe can run against the Portal-registered Vercel URL before
// the API ships. Server-side only: WORLD_RP_SIGNING_KEY never reaches the client bundle.
import { signRequest } from '@worldcoin/idkit-core/signing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  const action = (payload as { action?: unknown } | null)?.action;
  if (typeof action !== 'string' || action.length === 0) {
    return json({ error: 'invalid_request', field: 'action', reason: 'action must be a non-empty string' }, 400);
  }

  const rpId = process.env.WORLD_RP_ID;
  const signingKeyHex = process.env.WORLD_RP_SIGNING_KEY;
  if (!rpId || !signingKeyHex) {
    return json({ error: 'bad_state', detail: 'WORLD_RP_ID / WORLD_RP_SIGNING_KEY are not set on the server' }, 500);
  }

  const signature = signRequest({ signingKeyHex, action });

  return json(
    {
      rp_context: {
        rp_id: rpId,
        nonce: signature.nonce,
        created_at: signature.createdAt,
        expires_at: signature.expiresAt,
        signature: signature.sig,
      },
    },
    200,
  );
}
