'use client';

import { uniquenessClause, type CredentialLevel } from '@legwork/shared';
import { Button } from '../../components/ui/Button';
import { CREDENTIAL_LEVEL } from '../../lib/env';

export type LandingProps = {
  busy: boolean;
  onVerify: () => void;
  level?: CredentialLevel;
};

export const LANDING_LABEL = 'WORLD ID';
export const LANDING_TITLE = 'Verify once. Claim tasks nearby.';
export const VERIFY_BUTTON = 'Verify with World ID';
export function verifyCaption(level: CredentialLevel): string {
  return `about 30 seconds · ${uniquenessClause(level)}`;
}
export const VERIFY_CAPTION = verifyCaption(CREDENTIAL_LEVEL);

/** The three facts, in the order the prototype stacks them under the button. */
export const LANDING_FACTS = [
  'proof: photo + location',
  "paid after the poster approves — automatically when the task's window ends",
  'cloud-verified, operator-attested — onchain World ID verification is Orb-only today',
] as const;

/**
 * The unverified visitor's whole screen: one card, one action, three facts.
 *
 * The button says one short thing. Everything the sentence used to carry — how long it
 * takes, one account per person — is the caption under it, so the label fits on one line at
 * 390 px instead of overflowing its own box. The verification state is the header's job and
 * is not repeated here: `Verify to claim` appears once on this screen, in `<header>`.
 */
export function Landing({ busy, onVerify, level = CREDENTIAL_LEVEL }: LandingProps) {
  return (
    <section className="lw-card" data-step="landing">
      <p className="lw-list-label">{LANDING_LABEL}</p>
      <p className="lw-landing-title">{LANDING_TITLE}</p>

      <div data-floor="20">
        <Button variant="primary" size="lg" full disabled={busy} onClick={onVerify}>
          {VERIFY_BUTTON}
        </Button>
      </div>
      <p className="lw-cta-caption" data-cta-caption>
        {verifyCaption(level)}
      </p>

      <ul className="lw-facts" data-floor="20">
        {LANDING_FACTS.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
    </section>
  );
}
