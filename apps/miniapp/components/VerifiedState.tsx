'use client';

import { CREDENTIAL_LEVEL } from '../lib/env';
import { useSession } from '../lib/session';
import { VerifiedChip } from './ui/VerifiedChip';

/**
 * Lives in the sticky header so the worker's verification state is always above the fold.
 * T-24 fills in `useSession`; the chip below reads it and nothing else.
 */
export function VerifiedState() {
  const state = useSession();
  return <VerifiedChip state={state} compact level={CREDENTIAL_LEVEL} />;
}
