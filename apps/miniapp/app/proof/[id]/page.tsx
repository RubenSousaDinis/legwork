'use client';

import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { requireVerified } from '../../../lib/session';
import { readActiveClaim, type ActiveClaim } from '../../tasks/activeClaim';
import { ProofFlow } from '../ProofFlow';

/**
 * `/proof/<task_id>` — the proof screen for the one task this worker is holding.
 *
 * Two gates, in order. `requireVerified()` sends an unverified visitor back to `/`. Then the
 * stored claim has to be *this* task: a worker who wandered in from a link, or who let the
 * claim expire while walking, goes back to `/tasks` rather than photographing a door for a
 * task somebody else now holds.
 */

/** `undefined` while the claim has not been read yet — the first paint must not redirect. */
type ClaimState = ActiveClaim | null | undefined;

export default function ProofPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const session = requireVerified();
  const router = useRouter();
  const [claim, setClaim] = useState<ClaimState>(undefined);

  useEffect(() => {
    const stored = readActiveClaim();
    setClaim(stored);
    if (stored === null || stored.task_id !== id) router.replace('/tasks');
  }, [id, router]);

  if (session.status !== 'verified' || claim === undefined) {
    return <p className="lw-placeholder">Opening your proof screen…</p>;
  }

  if (claim === null || claim.task_id !== id) {
    return <p className="lw-placeholder">That task is not the one you are holding — back to the list…</p>;
  }

  return <ProofFlow claim={claim} taskId={id} />;
}
