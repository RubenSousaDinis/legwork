import { getAddress, isAddress } from 'viem';
import { z } from 'zod';
import { route, preflight } from '@/src/http/route';
import { rateLimit, clientKey } from '@/src/http/rateLimit';
import { ApiError } from '@/src/errors';
import { getChain } from '@/src/chain';
import { rawQuery } from '@/src/db/client';
import { consumeNonce, issueWorkerSession, requireIdkitSession } from '@/src/session';
import { verifyWalletAuth } from '@/src/siwe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ERC-4361 restricts a nonce to alphanumerics; ours is hex, and MiniKit rejects anything else. */
const Nonce = z.string().regex(/^[a-zA-Z0-9]+$/, 'expected an alphanumeric nonce');
const Address = z.string().refine(isAddress, 'expected a 20-byte hex address');

const Body = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('walletAuth'),
    payload: z.object({
      status: z.literal('success'),
      message: z.string().min(1),
      signature: z.string().min(1),
      address: Address,
      version: z.number().int(),
    }),
    nonce: Nonce,
  }),
  z.object({
    mode: z.literal('idkit'),
    worker_address: Address,
  }),
]);

/** The registration this API recorded when the worker first proved a unique human. */
async function nullifierOfWorker(worker: string): Promise<string | undefined> {
  const rows = await rawQuery('SELECT nullifier FROM nullifiers WHERE lower(worker) = lower($1)', [
    worker,
  ]);
  const value = rows[0]?.nullifier;
  return value === undefined || value === null ? undefined : String(value);
}

async function workerOfNullifier(nullifier: string): Promise<string | undefined> {
  const rows = await rawQuery('SELECT worker FROM nullifiers WHERE nullifier = $1', [nullifier]);
  const value = rows[0]?.worker;
  return value === undefined || value === null ? undefined : String(value);
}

/**
 * The registry is the record and the row is only a claim, so `isWorker` is asked in both
 * modes. A database that has been restored, edited or seeded wrongly still cannot mint a
 * session for an address the chain does not know.
 */
async function requireRegisteredWorker(worker: string): Promise<void> {
  if (!(await getChain().isWorker(getAddress(worker)))) {
    throw ApiError.of('forbidden', { reason: 'not_registered' });
  }
}

export const POST = route(async (req) => {
  rateLimit(`session:${clientKey(req)}`, { limit: 20, windowS: 60 });

  const raw = await req.json().catch(() => {
    throw ApiError.of('invalid_request', { field: '(root)', reason: 'expected a JSON body' });
  });
  const body = Body.parse(raw);

  let worker: string;
  if (body.mode === 'walletAuth') {
    // The signature first: an unsigned request must never be able to spend a live nonce.
    if (!(await verifyWalletAuth(body.payload, body.nonce))) throw ApiError.of('unauthorized');
    await consumeNonce(body.nonce);
    worker = getAddress(body.payload.address);
  } else {
    // idkit mode is the freshly-verified human's path, so the short-lived cookie is required
    // here — and the address it names has to be the one bound to that nullifier.
    const idkit = await requireIdkitSession(req);
    worker = getAddress(body.worker_address);
    const bound = await workerOfNullifier(idkit.nullifier);
    if (!bound || getAddress(bound) !== worker) {
      throw ApiError.of('forbidden', { reason: 'not_registered' });
    }
  }

  const nullifier = await nullifierOfWorker(worker);
  if (!nullifier) throw ApiError.of('forbidden', { reason: 'not_registered' });
  await requireRegisteredWorker(worker);

  const session = await issueWorkerSession({ worker, nullifier, mode: body.mode });
  return Response.json(
    { worker, nullifier, mode: body.mode, token: session.token },
    { headers: { 'set-cookie': session.cookie } },
  );
});

export const OPTIONS = preflight;
