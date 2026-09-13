import type { Metadata } from 'next';
import { Chip } from '../../components/Chip';
import { PoolHeadline } from '../../components/PoolChip';
import { SiteHeader } from '../../components/SiteHeader';
import { TRUST_MODEL_CLOSER, claimSentence, resolvedCredentialLevel, trustModelSentence } from '../copy';

export const metadata: Metadata = {
  title: 'Legwork · about',
};

/** The pool count is the subgraph's in live mode; five minutes is as stale as it gets. */
export const revalidate = 300;

const STANDARDS = ['World ID', 'ERC-8004', 'x402', 'USDC', 'Base Sepolia'] as const;

export default function AboutPage() {
  const level = resolvedCredentialLevel();
  const [before, after] = trustModelSentence(level).split('bounded, attributable work');
  return (
    <main className="landing">
      <SiteHeader current="about" />
      <h1 className="landing-page-title" data-floor="24">
        About
      </h1>
      <p className="landing-prose landing-claim" data-floor="24">
        {claimSentence(level)}
      </p>
      <section className="landing-trust">
        <p className="landing-prose" data-floor="24">
          {before}
          <strong>bounded, attributable work</strong>
          {after}
        </p>
        <p className="landing-closer" data-floor="24">
          {TRUST_MODEL_CLOSER}
        </p>
      </section>
      <section className="agents-block">
        <h2 className="landing-section-title">What is live and what is seeded</h2>
        <ul className="landing-facts">
          <li>One real registration — the demo worker&apos;s phone.</li>
          <li>Every seeded worker row on the board says so on the chip.</li>
          <li>
            The pool reads <PoolHeadline />. Never a total.
          </li>
          <li>Seeded workers cannot produce a verified registration and cannot claim an external task.</li>
        </ul>
      </section>
      <section className="agents-block">
        <h2 className="landing-section-title">Built on</h2>
        <div className="landing-chips">
          {STANDARDS.map((standard) => (
            <Chip key={standard} tone="neutral">
              {standard}
            </Chip>
          ))}
        </div>
      </section>
    </main>
  );
}
