/**
 * Binds a verified human to an address, an area and a set of task types.
 *
 * The order matters and is the order below: the session first (401 before any 400, so an
 * unauthenticated caller learns nothing about the body schema), then the body, then the row,
 * then the signature, then the chain — and only then the database. The row is bound **after**
 * the relayer returns a hash, never before: a revert that had already written the binding
 * would leave a human who can never register and an address nothing points at.
 *
 * The attestation is signed by the operator's verifier key and never leaves this request as
 * anything but transaction calldata: it is not logged, not returned and not stored.
 */
import { getAddress, isAddress, type Address } from 'viem';
import { z } from 'zod';
import { TASK_TYPES } from '@legwork/shared';
import { route, preflight } from '@/src/http/route';
import { rateLimit, clientKey } from '@/src/http/rateLimit';
import { ApiError } from '@/src/errors';
import { getChain } from '@/src/chain';
import { rawQuery } from '@/src/db/client';
import { logger } from '@/src/log';
import { requireIdkitSession } from '@/src/session';
import {
  signConfiguredAttestation,
  taskTypesMask,
  type AttestationMessage,
} from '@/src/services/attestation';
import { namedError, nullifierAlreadyRegistered } from '@/src/services/worldId';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Ten minutes is long enough for one relay and short enough that a leaked one is stale. */
const DEADLINE_S = 600;

/** geohash5: base32 without `a`, `i`, `l` or `o`. Five characters is roughly 5 km. */
const Area = z.string().regex(/^[0-9b-hjkmnp-z]{5}$/, 'expected a five-character geohash');

const Body = z.object({
  worker_address: z.string().refine(isAddress, 'expected a 20-byte hex address'),
  area: Area,
  task_types: z.array(z.enum(TASK_TYPES)).min(1, 'expected at least one task type'),
});

/** The registry's revert names, mapped onto what a client can act on. */
function fromRevert(name: string): ApiError {
  if (name === 'DuplicateNullifier') return nullifierAlreadyRegistered();
  if (name === 'WorkerAlreadyBound') return namedError('conflict', 'worker_already_bound');
  if (name === 'AttestationExpired' || name === 'BadAttestation' || name === 'AttestationUsed') {
    // The API signed this attestation seconds ago, so the registry refusing it is a bug in
    // this service, not something the worker did. The name goes to the log; the bytes never do.
    logger.error({ name }, 'attestation rejected by the registry');
    return namedError('internal', 'attestation_rejected', { name });
  }
  return namedError('conflict', name);
}

function revertName(err: unknown): string | undefined {
  const name = (err as { name?: unknown } | null)?.name;
  return typeof name === 'string' && name !== 'Error' && name.length > 0 ? name : undefined;
}

export const POST = route(async (req) => {
  // 401 first: the schema of the body is not something an anonymous caller gets to probe.
  const idkit = await requireIdkitSession(req);
  rateLimit(`register:${clientKey(req)}`, { limit: 10, windowS: 60 });

  const raw = await req.json().catch(() => {
    throw ApiError.of('invalid_request', { field: '(root)', reason: 'expected a JSON body' });
  });
  const body = Body.parse(raw);
  const worker = getAddress(body.worker_address) as Address;

  const rows = await rawQuery('SELECT worker FROM nullifiers WHERE nullifier = $1', [
    idkit.nullifier,
  ]);
  // No row means the session outlived the record it was issued against; that is not a
  // request to explain, it is a session to refuse.
  if (rows.length === 0) throw ApiError.of('unauthorized');
  const bound = rows[0]?.worker;
  if (bound !== undefined && bound !== null) throw nullifierAlreadyRegistered();

  const taskTypes = taskTypesMask(body.task_types);
  const message: AttestationMessage = {
    nullifierHash: BigInt(idkit.nullifier),
    worker,
    area: body.area,
    taskTypes,
    // Computed once, and the same value is signed and sent — a second `Date.now()` could
    // land in the next second and sign a deadline the registry never sees.
    deadline: BigInt(Math.floor(Date.now() / 1000) + DEADLINE_S),
  };

  const attestation = await signConfiguredAttestation(message);

  let tx: string;
  try {
    const result = await getChain().registerFor(
      message.nullifierHash,
      message.worker,
      message.area,
      message.taskTypes,
      message.deadline,
      attestation,
    );
    tx = result.hash;
  } catch (err) {
    const name = revertName(err);
    if (name) throw fromRevert(name);
    // Nothing came back from the node, so nothing is known about the transaction — and a
    // binding written now could contradict a registration that lands a block later.
    logger.error({ worker }, 'registerFor could not reach the chain');
    // 503, not 500: the service is fine and the request is worth retrying.
    throw namedError('internal', 'chain_unavailable', {}, 503);
  }

  await rawQuery('UPDATE nullifiers SET worker = $1 WHERE nullifier = $2', [
    worker,
    idkit.nullifier,
  ]);
  logger.info({ worker, tx }, 'worker registered');

  return Response.json({ tx, worker });
});

export const OPTIONS = preflight;
