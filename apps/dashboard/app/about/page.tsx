import type { Metadata } from 'next';
import { Chip } from '../../components/Chip';
import { SiteHeader } from '../../components/SiteHeader';
import { TRUST_MODEL_CLOSER, claimSentence, resolvedCredentialLevel, trustModelSentence } from '../copy';

export const metadata: Metadata = {
  title: 'Legwork · about',
};

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
          <li>Four worker rows on the board are seeded and say so on the chip.</li>
          <li>The pool reads 1 real · +20 seeded (demo data). Never a total.</li>
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
