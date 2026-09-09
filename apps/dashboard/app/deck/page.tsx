import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Chip } from '../../components/Chip';
import { SiteHeader } from '../../components/SiteHeader';
import { Wordmark } from '../../components/Wordmark';
import { TAGLINE, TRUST_MODEL_CLOSER, claimSentence, resolvedCredentialLevel, trustModelSentence } from '../copy';
import { apiUrl, dashboardUrl } from '../../lib/urls';

export const metadata: Metadata = {
  title: 'Legwork · deck',
};

const PRIOR_ART: {
  project: string;
  verification: string;
  payment: string;
  accountability: string;
  screening: string;
  reputation: string;
  ours?: boolean;
}[] = [
  {
    project: 'RentAHuman (YC, Feb 2026; 787,000+ registered)',
    verification: 'Signup form; bot-inflated supply',
    payment: 'Escrow advertised via MCP; payouts reported failing (Trustpilot)',
    accountability: 'None (API keys)',
    screening: 'None documented (six classes bought for a median $25)',
    reputation: 'Own',
  },
  {
    project: 'MeatLayer (UK)',
    verification: 'ID + background check + GPS',
    payment: 'Stripe escrow, released on proof; fee 15% on top, worker keeps 100%',
    accountability:
      'MCP server, REST API, per-agent profiles; no onchain identity other services can read',
    screening: 'No documented screening',
    reputation: 'Own',
  },
  {
    project: 'AgentHands (Synthesis Hackathon, 2026)',
    verification: 'Self Protocol passport ZK',
    payment: 'USDC escrow on Base Sepolia, released on IPFS photo proof; x402',
    accountability: 'ERC-8004 identity',
    screening: '—',
    reputation: '—',
  },
  {
    project: 'agentDesk (ETHGlobal Cannes 2026)',
    verification: 'World ID',
    payment: 'x402-gated access between agents and humans, World Chain',
    accountability: '—',
    screening: '—',
    reputation: '—',
  },
  {
    project: 'HumanPing (unverified)',
    verification: 'World ID among four verification layers (unverified)',
    payment: 'Escrow locked at task creation; 18% fee (unverified)',
    accountability: 'API keys (unverified)',
    screening: '— (unverified)',
    reputation: 'Own (unverified)',
  },
  {
    project: 'CYBERDYNE (live, Base mainnet)',
    verification: 'Verified-X humans',
    payment: 'Non-custodial x402 auth-capture escrow, 2.5% fee; MCP server',
    accountability: '—',
    screening: '— (task catalogue is social-media engagement, the paper\'s fourth class)',
    reputation: 'Own',
  },
  {
    project: 'World AgentKit',
    verification: "Proof-of-human for the agent's owner",
    payment: 'x402 (payments), no marketplace',
    accountability: 'Yes (AgentBook)',
    screening: '—',
    reputation: '—',
  },
  {
    project: 'Prolific API / Rapidata',
    verification: 'Panel vetting / ad-sourced',
    payment: 'Platform-billed',
    accountability: '—',
    screening: 'Research-ethics review',
    reputation: 'Own',
  },
  {
    project: 'Human API (Apr 2026, $65M)',
    verification: 'Reviewed work; verification unspecified',
    payment: 'Platform payout rails after approval',
    accountability: 'API keys',
    screening: 'Review before payout',
    reputation: 'Own',
  },
  {
    project: 'Legwork',
    verification:
      'One World ID nullifier = one worker (Orb; cloud-verified, operator-attested; claims relayed, gas paid by Legwork)',
    payment:
      'Onchain escrow released on proof; the hiring agent is the refund party; 15% on top',
    accountability:
      'ERC-8004 identity + worker feedback + task-refused marks, written by the Task API against the identity that paid',
    screening:
      'Six classes refused at the API through field-level task schemas; free text never reaches the classifier',
    reputation:
      'Worker: nullifier-keyed, deduped per hiring agent, O(1) onchain · Agent: ERC-8004',
    ours: true,
  },
];

const STEPS = [
  'The worker verifies once — World ID through IDKit, one nullifier = one worker account. The demo is Orb.',
  'The agent asks for one of four typed things and pays through x402. The API screens the request against the six documented abuse classes.',
  'The money is locked before anyone can claim, with a per-task cap and a per-agent daily cap.',
  'The worker signs in and Legwork relays the claim and pays the gas. Proof is a photo hash plus GPS plus timestamp inside a 30-minute claim window.',
  'Escrow releases on approval or auto-releases after the dispute window. Expiry refunds the buyer.',
  'Both records move — worker reputation keyed to the nullifier, the agent\'s record on ERC-8004.',
];

function Board({ n, children }: { n: number; children: ReactNode }) {
  return (
    <section className="deck-board" id={`board-${n}`}>
      {children}
      <p className="deck-counter mono">
        {n} / 13
      </p>
    </section>
  );
}

export default function DeckPage() {
  const level = resolvedCredentialLevel();
  const [trustBefore, trustAfter] = trustModelSentence(level).split('bounded, attributable work');
  const origin = dashboardUrl();
  const hosted = `claude mcp add --transport http legwork ${apiUrl()}/mcp`;

  return (
    <div className="deck">
      <SiteHeader current="deck" />
      <div className="deck-boards">
        <Board n={1}>
          <Wordmark className="landing-wordmark" />
          <p className="landing-tagline" data-floor="24">
            {TAGLINE}
          </p>
          <p className="landing-prose" data-floor="24">
            Real-world verification for AI agents — one verified human per account, money locked
            before work starts, paid the moment the proof lands.
          </p>
          <p className="mono deck-kicker">
            ETHOnline 2026 · solo build · Base Sepolia · World ID · ERC-8004 · x402 · USDC
          </p>
        </Board>

        <Board n={2}>
          <p className="deck-kicker">AI is already hiring humans. It&apos;s a mess.</p>
          <h1 className="deck-headline" data-floor="24">
            <span className="deck-status-quo">787,000+</span> &quot;workers&quot;, failing
            payouts, and any abuse for <span className="deck-status-quo">$25</span>.
          </h1>
          <ul className="deck-list">
            <li>
              RentAHuman, Feb 2026 — 787,000+ registered humans across 100+ countries, tasks done
              and money never arriving, supply inflated by bots and duplicates.
            </li>
            <li>
              The research (Mehta, arXiv:2602.19514, Feb 2026) — six abuse classes bought on that
              marketplace for a median $25 per worker, and a third of the bounties came in through
              APIs and MCP.
            </li>
            <li>
              Agents will keep hiring people; the question is whether the person is real, whether
              they get paid, and whether the agent can be held to account.
            </li>
          </ul>
        </Board>

        <Board n={3}>
          <p className="deck-kicker">Every marketplace trusts a signup form.</p>
          <h1 className="deck-headline" data-floor="24">
            Verified worker? Screened request? Pick one — until now.
          </h1>
          <div className="deck-matrix">
            <div className="deck-matrix-cell">
              <span className="mono">none · unscreened</span>
              <p>The platform holds the money.</p>
            </div>
            <div className="deck-matrix-cell">
              <span className="mono">none · refused at the API</span>
              <p>A contract does not hold the money.</p>
            </div>
            <div className="deck-matrix-cell">
              <span className="mono">verified · unscreened</span>
              <p>The platform holds the money.</p>
            </div>
            <div className="deck-matrix-cell is-ours">
              <span className="mono">verified · refused at the API</span>
              <p>Empty. A contract holds the money. This is the cell.</p>
            </div>
          </div>
          <p className="landing-prose" data-floor="24">
            Nobody refuses the documented abuse classes at the API and writes the refusal to the
            hiring agent&apos;s public record.
          </p>
        </Board>

        <Board n={4}>
          <p className="landing-prose landing-claim" data-floor="24">
            {claimSentence(level)}
          </p>
          <p className="deck-kicker">And the trust model, stated as a bound, not a promise:</p>
          <p className="landing-prose" data-floor="24">
            {trustBefore}
            <strong>bounded, attributable work</strong>
            {trustAfter}
          </p>
          <p className="landing-closer" data-floor="24">
            {TRUST_MODEL_CLOSER}
          </p>
        </Board>

        <Board n={5}>
          <p className="deck-kicker">How it works: verify once, escrow every task.</p>
          <h1 className="deck-headline" data-floor="24">
            One verification. One contract. Every task.
          </h1>
          <ol className="deck-list deck-list-numbered">
            {STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Board>

        <Board n={6}>
          <p className="deck-kicker">The demo: a real person, on camera, paid on proof.</p>
          <ul className="deck-list">
            <li>The listing says one thing, the door says another.</li>
            <li>
              The agent preflights workers from live data, hires, pays 3.45 USDC (3.00 + 0.45 fee);
              the escrow meter locks.
            </li>
            <li>
              The worker verifies, claims (relayed, gas paid by Legwork), walks, photographs the
              sign, submits. Escrow releases 3.00 to the worker and 0.45 as the fee.
            </li>
            <li>
              During the walk, a well-formed call-confirm asking the callee to read back a
              six-digit code is refused at the API as authentication circumvention and lands as a
              mark on the agent&apos;s public record.
            </li>
          </ul>
        </Board>

        <Board n={7}>
          <p className="deck-kicker">One human, one account.</p>
          <h1 className="deck-headline deck-headline-long" data-floor="24">
            787,000 signups. Or one account per person. One of those is a real number.
          </h1>
          <p className="landing-prose" data-floor="24">
            Supply on today&apos;s marketplaces is a signup form; ours is one World ID nullifier =
            one worker. Reputation is keyed to the nullifier, not the address — rotate wallets,
            keep your record; agents are keyed to their ERC-8004 identity. Worker reputation is
            deduplicated per hiring agent and accumulated onchain with O(1) reads.
          </p>
          <div className="deck-split">
            <p className="deck-split-left">787,000 registered (RentAHuman)</p>
            <p className="deck-split-right">1 account = 1 person</p>
          </div>
        </Board>

        <Board n={8}>
          <p className="deck-kicker">The empty cell (and everyone standing near it).</p>
          <h1 className="deck-headline deck-headline-long" data-floor="24">
            The neighbors are real. The cell is still empty.
          </h1>
          <div className="deck-table-wrap">
            <table className="deck-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Worker verification</th>
                  <th>Payment / escrow</th>
                  <th>Agent accountability</th>
                  <th>Abuse screening</th>
                  <th>Reputation source</th>
                </tr>
              </thead>
              <tbody>
                {PRIOR_ART.map((row) => (
                  <tr key={row.project} className={row.ours ? 'is-ours' : undefined}>
                    <td>{row.project}</td>
                    <td>{row.verification}</td>
                    <td>{row.payment}</td>
                    <td>{row.accountability}</td>
                    <td>{row.screening}</td>
                    <td>{row.reputation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="landing-prose" data-floor="24">
            The closest neighbour has three of the four and no screening and nothing written back;
            we cite neighbours by name because a claim you can falsify taints everything else.
          </p>
        </Board>

        <Board n={9}>
          <p className="deck-kicker">What Legwork is NOT.</p>
          <h1 className="deck-headline" data-floor="24">
            Bounded work. Not magic.
          </h1>
          <ul className="deck-list deck-not">
            <li>
              Not competence vetting — a verified human can still be wrong. Proof, the dispute
              window and reputation are the answer.
            </li>
            <li>
              Not a dispute court — v0 is approve, auto-release after the window, or an operator
              resolves, disclosed, zero fee on arbitration.
            </li>
            <li>
              Not KYC or payroll — testnet USDC today, workers paid per task, no employment claims.
            </li>
            <li>
              Not fraud-proof — screening is a deterministic gate plus a classifier that can only
              add refusals, over enumerated task types. It raises the cost of abuse, it does not
              end it. GPS is self-reported and spoofable, so we anchor, geofence and dispute it
              rather than prove it.
            </li>
          </ul>
        </Board>

        <Board n={10}>
          <p className="deck-kicker">Real rails, running today.</p>
          <h1 className="deck-headline deck-headline-long" data-floor="24">
            Production identity and payments, our escrow on top.
          </h1>
          <div className="deck-split deck-split-copy">
            <div>
              <p className="landing-section-title">Live, not ours</p>
              <ul className="deck-list">
                <li>World ID via the Developer Portal and IDKit 4.x</li>
                <li>ERC-8004 identity and reputation registries on Base Sepolia</li>
                <li>the x402 reference facilitator</li>
                <li>USDC</li>
              </ul>
            </div>
            <div>
              <p className="landing-section-title">Ours, deployed</p>
              <div className="landing-chips">
                <Chip tone="neutral">WorkerRegistry</Chip>
                <Chip tone="neutral">TaskEscrow</Chip>
                <Chip tone="neutral">Reputation</Chip>
                <Chip tone="neutral">AbuseMark</Chip>
              </div>
              <p className="landing-prose" data-floor="24">
                plus the subgraph, the Task API and MCP server, the mini-app and this dashboard.
              </p>
            </div>
          </div>
          <div className="deck-disclosed landing-chips">
            <Chip tone="verified">World ID · Orb</Chip>
            <Chip tone="seeded">1 real · +20 seeded (demo data)</Chip>
            <Chip tone="neutral">testnet USDC — not spendable</Chip>
            <Chip tone="neutral">operator-attested</Chip>
          </div>
        </Board>

        <Board n={11}>
          <p className="deck-kicker">Where this goes.</p>
          <h1 className="deck-headline deck-headline-long" data-floor="24">
            Four task types are v1. The trust layer is the point.
          </h1>
          <ul className="deck-list">
            <li>More task types, each with its own proof schema, never free text.</li>
            <li>Operator spend policies.</li>
            <li>Proof re-verification by a second worker before any human review.</li>
            <li>
              Mainnet and real payouts through a payout provider, and Router-based onchain
              verification on every chain and credential that has it.
            </li>
          </ul>
        </Board>

        <Board n={12}>
          <p className="deck-kicker">The agent economy&apos;s most human product.</p>
          <p className="landing-prose" data-floor="24">
            Agents hiring humans went from a meme to a documented abuse market in one quarter, and
            the fix is not a better signup form. A demo a non-technical judge understands in ten
            seconds. Built on the identity and payment rails sponsors shipped this year, with one
            contract family on top.
          </p>
          <p className="deck-huge">A real person. A real task. Paid on proof.</p>
        </Board>

        <Board n={13}>
          <h1 className="deck-headline" data-floor="24">
            Legwork — real-world verification for AI agents.
          </h1>
          <p className="deck-huge">A real person. A real task. Paid on proof.</p>
          <p className="landing-tagline" data-floor="24">
            {TAGLINE}
          </p>
          <p className="landing-prose" data-floor="24">
            one verified human per account, money locked before work, paid on proof; built solo in
            10 days, from scratch, with an AI-disclosed granular history.
          </p>
          <p className="mono deck-kicker">{origin}</p>
          <pre className="agents-code">
            <code>{hosted}</code>
          </pre>
        </Board>
      </div>
    </div>
  );
}
