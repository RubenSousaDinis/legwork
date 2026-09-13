/**
 * The IDKit result, forwarded to World and turned into an idkit-session.
 *
 * The body is read **once**, as text, and that same string is what goes to World: the proof
 * is signed over those bytes, so parsing and re-serialising it would reorder keys and
 * invalidate it. The parsed copy below is read-only and never sent anywhere.
 */
import { z } from 'zod';
import { route, preflight } from '@/src/http/route';
import { rateLimit, clientKey } from '@/src/http/rateLimit';
import { ApiError } from '@/src/errors';
import { getConfig } from '@/src/config';
import { rawQuery } from '@/src/db/client';
import { issueIdkitSession, issueSelfieSession, optionalWorkerSession } from '@/src/session';
import {
  isOrbCredential,
  nullifierAlreadyRegistered,
  nullifierToNumeric,
  verifyWithWorld,
} from '@/src/services/worldId';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Payload = z.object({ action: z.string().min(1) });

export const POST = route(async (req) => {
  rateLimit(`idkit-verify:${clientKey(req)}`, { limit: 30, windowS: 60 });

  const rawBody = await req.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw ApiError.of('invalid_request', { field: '(root)', reason: 'expected a JSON body' });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw ApiError.of('invalid_request', { field: '(root)', reason: 'expected a JSON object' });
  }

  const action = getConfig().WORLD_ACTION;
  const payload = Payload.safeParse(parsed);
  if (!payload.success || payload.data.action !== action) {
    throw ApiError.of('invalid_request', { field: 'action', reason: 'unknown_action' });
  }

  const result = await verifyWithWorld(rawBody);
  if (!result.ok) {
    // World's code, never the proof. A refused proof is a plain 400 and marks nothing.
    throw ApiError.of('invalid_request', {
      field: 'proof',
      reason: result.code,
      ...(result.detail ? { detail: result.detail } : {}),
    });
  }
  if (result.action !== '' && result.action !== action) {
    throw ApiError.of('invalid_request', { field: 'action', reason: 'action_mismatch' });
  }

  const caller = await optionalWorkerSession(req);
  if (caller) {
    // Claim-time Selfie Check: a live person is behind this phone. Not a second worker
    // account — writing this nullifier into the uniqueness table would 409 the next
    // claim by the same human.
    if (result.level_source !== 'config' && isOrbCredential(result.level)) {
      throw ApiError.of('invalid_request', { field: 'proof', reason: 'selfie_required' });
    }
    const selfie = await issueSelfieSession({
      worker: caller.worker,
      nullifier: nullifierToNumeric(result.nullifier),
      level: result.level,
    });
    return Response.json(
      { verified: true, nullifier: result.nullifier, level: result.level },
      { headers: { 'set-cookie': selfie.cookie } },
    );
  }

  // Login accepts Selfie Check (`face`) and Orb. Sandbox testers present the camera
  // credential; the uniqueness row is still one nullifier = one worker.
  const nullifier = nullifierToNumeric(result.nullifier);

  // One human, one row. The insert is idempotent so a worker who verifies twice before
  // registering keeps the row they already have — and the select afterwards is what decides
  // whether that row is still free.
  await rawQuery(
    'INSERT INTO nullifiers (nullifier, action, worker) VALUES ($1, $2, NULL) ON CONFLICT (nullifier) DO NOTHING',
    [nullifier, action],
  );
  const rows = await rawQuery('SELECT worker FROM nullifiers WHERE nullifier = $1', [nullifier]);
  const bound = rows[0]?.worker;

  // One nullifier = one worker — but a returning human is still this human, and the proof
  // they just presented says so at least as strongly as the wallet signature `walletAuth`
  // mode accepts. So the conflict keeps its 409 and its name, and now carries the cookie and
  // the address it belongs to: `POST /session` in idkit mode reads that cookie and will only
  // mint for the worker this nullifier is actually bound to, so the cookie opens nothing the
  // proof did not already open. Without it a returning worker outside World App had no way
  // back in at all — no cookie for idkit mode, and no MiniKit for walletAuth mode.
  if (bound !== undefined && bound !== null) {
    const returning = await issueIdkitSession({ nullifier, level: result.level, action });
    const conflict = nullifierAlreadyRegistered();
    return Response.json(
      { ...conflict.body(), worker: bound },
      { status: conflict.status, headers: { 'set-cookie': returning.cookie } },
    );
  }

  const session = await issueIdkitSession({ nullifier, level: result.level, action });

  return Response.json(
    { verified: true, nullifier: result.nullifier, level: result.level },
    { headers: { 'set-cookie': session.cookie } },
  );
});

export const OPTIONS = preflight;
