'use client';

import { Button } from '../../components/ui/Button';

export type LandingProps = {
  busy: boolean;
  onVerify: () => void;
};

export const LANDING_LABEL = 'WORLD ID';
export const LANDING_TITLE = 'Verify once. Claim tasks nearby.';
export const VERIFY_BUTTON = 'Verify with World ID';
export const VERIFY_CAPTION = 'about 30 seconds · one account per person';

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
export function Landing({ busy, onVerify }: LandingProps) {
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
        {VERIFY_CAPTION}
      </p>

      <ul className="lw-facts" data-floor="20">
        {LANDING_FACTS.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
    </section>
  );
}
