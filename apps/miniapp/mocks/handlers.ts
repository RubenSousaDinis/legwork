import { http, HttpResponse } from 'msw';

/** The shapes are the ones in packages/shared/src/api-contract.ts — nothing invented here. */
export const RP_CONTEXT = {
  rp_id: 'rp_0123456789abcdef',
  nonce: '9f1c3a7d5e2b4806a1c9d7e3f5b20486',
  created_at: 1_757_030_400,
  expires_at: 1_757_030_700,
  signature:
    '0x2f7a1c9e4b8d60315af2c7e9d4b6081537ac2e9f4b7d61035ae2c8f9d4b70614' +
    '5ac3e8f2d9b60417ae2c9f8d4b6103571c',
};

export const VERIFY_RESPONSE = {
  verified: true as const,
  nullifier: '0x1f3e5a7c9b0d2468ace02468ace02468ace02468ace02468ace02468ace02468',
  level: 'orb',
  world_response: { nullifier_hash: '0x1f3e', verification_level: 'orb' },
};

/** What the last `POST /idkit/verify` received, verbatim — the forwarding assertion reads it. */
let lastVerifyText: string | null = null;

export function lastVerifyBody(): string | null {
  return lastVerifyText;
}

export function resetLastVerifyBody(): void {
  lastVerifyText = null;
}

export const handlers = [
  http.post('*/api/idkit/request', async ({ request }) => {
    const body = (await request.json()) as { action?: unknown } | null;
    if (typeof body?.action !== 'string' || body.action.length === 0) {
      return HttpResponse.json(
        { error: 'invalid_request', field: 'action', reason: 'action must be a non-empty string' },
        { status: 400 },
      );
    }
    return HttpResponse.json({ rp_context: RP_CONTEXT });
  }),

  http.post('*/api/idkit/verify', async ({ request }) => {
    lastVerifyText = await request.text();
    return HttpResponse.json(VERIFY_RESPONSE);
  }),
];

/**
 * The 409 scenario: one person, one worker account. `server.use(...)` it for a single test.
 * `nullifier_already_registered` is a member of `GenericError` in the contract.
 */
export const nullifierAlreadyRegistered = http.post('*/api/idkit/verify', async ({ request }) => {
  lastVerifyText = await request.text();
  return HttpResponse.json({ error: 'nullifier_already_registered' }, { status: 409 });
});
