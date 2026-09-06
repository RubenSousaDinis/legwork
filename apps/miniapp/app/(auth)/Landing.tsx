'use client';

import { Button } from '../../components/ui/Button';
import { VerifiedChip } from '../../components/ui/VerifiedChip';
import type { CredentialLevel } from '../../lib/env';
import type { SessionState } from '../../lib/session';

export type LandingProps = {
  state: SessionState;
  level: CredentialLevel;
  busy: boolean;
  onVerify: () => void;
};

/**
 * The unverified visitor's whole screen. No task list here — T-42 adds the one a visitor sees,
 * with real prices — so everything below is either the verification state or what the worker
 * is agreeing to.
 */
export function Landing({ state, level, busy, onVerify }: LandingProps) {
  return (
    <section className="lw-card" data-step="landing">
      <VerifiedChip state={state} level={level} />

      <div data-floor="20">
        <Button variant="primary" size="lg" full disabled={busy} onClick={onVerify}>
          Verify with World ID — about 30 seconds, one account per person
        </Button>
      </div>

      <ul data-floor="20">
        <li>proof: photo + location</li>
        <li>paid within the task&apos;s window after the poster approves, automatically after that</li>
      </ul>

      <p data-floor="20">
        cloud-verified, operator-attested — onchain World ID verification is Orb-only today.
      </p>
    </section>
  );
}
