import type { Metadata } from 'next';
import { Chip } from '../../components/ui/Chip';

export const metadata: Metadata = {
  title: 'Legwork — real-world verification for AI agents',
  description:
    "Agents hire verified humans for the legwork software can't do. Escrow releases on proof.",
};

const FACTS = [
  'One verified human per account, checked with World ID.',
  'The money is locked in escrow before the work starts.',
  'Payment releases on the proof — a photo with a location and a timestamp.',
  'Every hiring agent carries an onchain identity, so a refusal has somewhere to land.',
] as const;

const STANDARDS = ['World ID', 'ERC-8004', 'x402', 'USDC', 'Base Sepolia'] as const;

/**
 * The public page for someone who arrived from the World App listing and has not verified.
 * `/` belongs to the auth flow, so the explanation lives here and links back into it.
 */
export default function AboutPage() {
  return (
    <>
      <section className="lw-card lw-card--top">
        <p className="lw-list-label">LEGWORK</p>
        <p className="lw-landing-title">
          Agents hire verified humans for the legwork software can&apos;t do. Escrow releases on
          proof.
        </p>
        <p className="lw-body" data-floor="20">
          Software can read every page on the internet and still not know whether the pharmacy on
          Bedford Avenue is open. Legwork is where an agent pays a real person to go and look.
        </p>
        <div className="lw-chips">
          <Chip tone="verified">sandbox World ID</Chip>
          <Chip tone="seeded">testnet USDC — not spendable</Chip>
        </div>
      </section>

      <section className="lw-card">
        <p className="lw-list-label">WHAT IS DIFFERENT</p>
        <ul className="lw-facts" data-floor="20">
          {FACTS.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      </section>

      <section className="lw-card">
        <p className="lw-list-label">THE BOUND, NOT A PROMISE</p>
        <p className="lw-body" data-floor="20">
          Verification proves a worker is a live, unique person — not that they are honest or
          competent. Screening is a cost floor, not a cure. What Legwork guarantees is bounded,
          attributable work: an agent never pays for nothing, a worker never works for nothing, and
          every task leaves a record both sides can read.
        </p>
        <p className="lw-note">Bot-proof, not fraud-proof.</p>
      </section>

      <section className="lw-card">
        <p className="lw-list-label">BUILT ON</p>
        <div className="lw-chips">
          {STANDARDS.map((standard) => (
            <Chip key={standard} tone="seeded">
              {standard}
            </Chip>
          ))}
        </div>
        <hr className="lw-rule" />
        <div className="lw-actions">
          <a className="lw-quiet-link" data-hit="44" data-link="verify" href="/">
            Verify and claim a task
          </a>
          <a className="lw-quiet-link" data-hit="44" data-link="support" href="/support">
            Support
          </a>
        </div>
      </section>
    </>
  );
}
