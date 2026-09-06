'use client';

import { CREDENTIAL_LEVEL } from '../lib/env';
import { useSession } from '../lib/session';
import { VerifiedChip } from './ui/VerifiedChip';

/**
 * Lives in the sticky header so the worker's verification state is always above the fold —
 * the full banner and the level chip, not a one-line summary, because that banner is what
 * every route has to keep visible. The level comes from the session the API answered with;
 * `CREDENTIAL_LEVEL` is only the fallback for a worker who has not verified yet.
 */
export function VerifiedState() {
  const state = useSession();
  const level = state.status === 'verified' && state.level === 'selfie' ? 'selfie' : 'orb';
  return <VerifiedChip state={state} level={state.status === 'verified' ? level : CREDENTIAL_LEVEL} />;
}
