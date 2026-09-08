'use client';

import { useSession } from '../lib/session';
import { VerifiedChip } from './ui/VerifiedChip';

/**
 * The header's verification state, in two pieces.
 *
 * Row 1 carries a one-line state beside the wordmark: the mono `mini app` caption while the
 * worker is unverified, the compact `Verified human ✓ · sandbox` pill once they are not.
 * Row 2 is `VerifiedChip` itself — the `Verify to claim` chip before verification and the
 * full banner after it, because that banner is what every route has to keep above the fold.
 *
 * Both are children of `.lw-header`, which is a grid: the caption or the pill takes the
 * right-hand column and row 2 spans the width under it. `Verify to claim` renders here and
 * nowhere else on the unverified landing screen.
 *
 * The level comes from the session the API answered with.
 */
export function VerifiedState() {
  const state = useSession();
  const verified = state.status === 'verified';
  const level = verified && state.level === 'selfie' ? 'selfie' : 'orb';

  return (
    <>
      {verified ? (
        <VerifiedChip compact level={level} state={state} />
      ) : (
        <span className="lw-header__caption" data-header="caption">
          mini app
        </span>
      )}
      <span className="lw-header__banner">
        <VerifiedChip level={level} state={state} />
      </span>
    </>
  );
}
