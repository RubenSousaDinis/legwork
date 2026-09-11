import {
  ABUSE_CLASSES,
  CREDENTIAL_LABEL,
  DAILY_CAP_USDC,
  DEFAULT_CLAIM_TTL_S,
  DEFAULT_DISPUTE_WINDOW_S,
  DEFAULT_SUBMIT_TTL_S,
  DEMO_DISPUTE_WINDOW_S,
  ERC8004_IDENTITY,
  ERC8004_REPUTATION,
  INSTALL_LINE,
  MAX_OPEN_TASKS_PER_BUYER,
  MAX_TASK_AMOUNT_USDC,
  NO_RETRY_SENTENCE,
  PRICE_FLOOR_USDC,
  TASK_TYPES,
  USDC,
} from '@legwork/shared';
import { Chip } from '../../components/Chip';
import { Footprint } from '../../components/Footprint';
import { MonoTag } from '../../components/MonoTag';
import { SiteHeader } from '../../components/SiteHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { GITHUB_REPO, apiUrl, dashboardUrl, miniappUrl } from '../../lib/urls';
import {
  LANDING_HERO,
  TAGLINE,
  X402_SENTENCE,
  claimSentence,
  resolvedCredentialLevel,
} from '../copy';
import { TrustModel } from '../TrustModel';

const TYPE_LINES: Record<(typeof TASK_TYPES)[number], string> = {
  'verify-open': 'Walk past a place and say if it is open.',
  'photo-of': 'One photo of one named subject at one place.',
  'call-confirm': "A short phone call in the place's own language, from a closed template.",
  'compare-two': 'Two items, one closed criterion, one answer.',
};

const AGENT_STEPS: { tool: string; body: string }[] = [
  {
    tool: 'preflight_workers',
    body: 'How many people could take this near the area, and whether the median is seeded.',
  },
  {
    tool: 'check_task',
    body: 'Dry-run screening. Never posts, never pays, never marks.',
  },
  {
    tool: 'hire_human',
    body: 'Posts the task and locks 3.45 USDC in escrow (3.00 to the worker, 0.45 fee on top). Hosted MCP cannot pay: it returns payment_required and the local install line.',
  },
  {
    tool: 'task_status',
    body: 'Long-poll with wait_seconds=50. Answers come back in minutes. Do not re-post the same task.',
  },
  {
    tool: 'approve_task · dispute_task',
    body: 'Release on approve, or contest the proof inside the window. autoRelease fires when the window ends with no dispute.',
  },
];

const WORKER_STEPS: { label: string; body: string }[] = [
  {
    label: 'Verify once',
    body: 'World ID through IDKit. One nullifier is one worker account. Registration is cloud-verified and operator-attested; onchain World ID verification is Orb-only today.',
  },
  {
    label: 'Sign in',
    body: 'World App wallet on the phone. The session cookie is the worker, not a pasted key.',
  },
  {
    label: 'Claim',
    body: 'Open tasks nearest first. Legwork relays the claim and pays the gas, so a worker never needs ETH.',
  },
  {
    label: 'Do the errand',
    body: 'Walk, look, photograph. Do not photograph people. GPS is used when the webview has a fix; when it does not, that absence is disclosed rather than invented.',
  },
  {
    label: 'Submit proof',
    body: 'The photo is re-encoded on the phone, EXIF stripped, keccak256 hashed. That hash goes onchain. You are paid for the proof, not the answer.',
  },
];

const SCREEN_STEPS = [
  'Type gate. Only the four enumerated types; free text is not a task type.',
  'Schema checks, field by field. A schema error is a plain 4xx and never marks.',
  'Deterministic rules: denylist, named person, six-class keywords. Authoritative.',
  'Classifier on the free-text path only, add-only, 3 second timeout then the keyword class. It can add a refusal. It cannot overturn one.',
  'Refusal payload. If the payer has an ERC-8004 identity, AbuseMark writes task-refused:<class> against that identity, never a name taken from the body.',
] as const;

const POST_ORDER = [
  'x402 verify (no money moves)',
  'envelope + schema',
  'deterministic gate',
  'classifier (free-text path only)',
  'caps (5 open tasks, 25 USDC/day, 10 USDC/task)',
  'agent id from the payer, via ERC-8004 IdentityRegistry',
  'TaskEscrow.post through TxQueue, buyer = payer',
  'x402 settle, idempotency key = authorization nonce',
  '201',
] as const;

const LAYERS: { role: string; title: string; body: string; items: string[] }[] = [
  {
    role: 'surfaces',
    title: 'What people and agents touch',
    body: 'Four deployed hosts. The dashboard is public and read-only. The mini-app is the worker phone inside World App. The Task API is the hire loop. MCP is the agent door.',
    items: [
      'dashboard · public mission control, receipts, refusals',
      'mini-app · verify, claim, proof, earnings',
      'Task API · REST + hosted /mcp',
      'local MCP · npx @legwork/mcp with BUYER_PRIVATE_KEY',
    ],
  },
  {
    role: 'packages',
    title: 'What the API is made of',
    body: 'Frozen interfaces live in @legwork/shared. Screening, payments and chain writes are separate packages so a schema error cannot mark and a refused task cannot settle.',
    items: [
      '@legwork/shared · types, money math, envelopes',
      '@legwork/screening · gate + classifier + OSM/Overpass place index',
      '@legwork/payments · x402 verify then settle',
      '@legwork/chain · TxQueue, every write',
      '@legwork/mcp · six tools, hosted and local',
      '@legwork/subgraph-client · preflight and the agent card',
    ],
  },
  {
    role: 'chain',
    title: 'What holds the money and the records',
    body: 'Four contracts we deployed on Base Sepolia, plus ERC-8004 registries and USDC that are live and not ours. Pause gates post and claim only: release, dispute and expiry keep working.',
    items: [
      'WorkerRegistry · one nullifier, one account; seeded rows cannot mint a verified human',
      'TaskEscrow · locks 3.45, releases 3.00 + 0.45, refunds the buyer on expiry',
      'Reputation · nullifier-keyed, one voice per hiring agent',
      'AbuseMark · the only writer of agent-side feedback; operator-attested in v0',
    ],
  },
  {
    role: 'index',
    title: 'What the public record is',
    body: 'The Graph subgraph is load-bearing: preflight_workers reads it. It stores area as geohash5. It never stores a coordinate, a spec, a note or a proof photo.',
    items: [
      'Worker, Task, Mark, Feedback, Outcome, PosterStats',
      'seeded is an onchain flag, never inferred',
      'dashboard live mode maps this index; a missing source contributes zero and names itself',
    ],
  },
  {
    role: 'private',
    title: 'What never goes public',
    body: 'Exact coordinates stay on the private task record. Proof photos live in a private bucket behind signed URLs. The dashboard never shows raw spec text or a requester identity.',
    items: [
      'API database · specs, sessions, screening log (hash, class, rule; no spec text)',
      'proof bucket · stripped JPEG, original retained for the dispute window',
      'buyer_token · unlocks the thumbnail on the receipt, then dropped',
    ],
  },
];

const OURS = [
  {
    name: 'WorkerRegistry',
    address: '0xc33d229046507f4C2E664cbf974542c92eEAbAf4',
  },
  {
    name: 'TaskEscrow',
    address: '0x641B56dfA3A033D84a75588c18579347A0DE3c6B',
  },
  {
    name: 'Reputation',
    address: '0x2f731B56D02080190fa2ef7813887B2743551E43',
  },
  {
    name: 'AbuseMark',
    address: '0x29145D47EFc76bEaBc3A4011cFf7fC0fBEa02608',
  },
] as const;

const NOT_OURS = [
  { name: 'ERC-8004 IdentityRegistry', address: ERC8004_IDENTITY },
  { name: 'ERC-8004 ReputationRegistry', address: ERC8004_REPUTATION },
  { name: 'USDC', address: USDC },
] as const;

const LIFECYCLE_MAIN = ['open', 'claimed', 'submitted', 'released'] as const;
const LIFECYCLE_FORKS = ['refunded', 'disputed', 'resolved', 'refused'] as const;

function basescan(address: string): string {
  return `https://sepolia.basescan.org/address/${address}`;
}

function StepRail({ last, end = 'footprint' }: { last: boolean; end?: 'footprint' | 'dot' }) {
  return (
    <span className="overview-rail" aria-hidden="true">
      {last && end === 'footprint' ? (
        <span className="overview-rail-end">
          <Footprint dimmed={false} />
        </span>
      ) : (
        <>
          <span className="meter-dot" />
          {last ? null : <span className="overview-rail-path" />}
        </>
      )}
    </span>
  );
}

export function Overview() {
  const level = resolvedCredentialLevel();
  const hosted = `claude mcp add --transport http legwork ${apiUrl()}/mcp`;

  return (
    <main className="landing overview" data-testid="overview">
      <SiteHeader />

      <p className="overview-kicker" data-floor="24">
        <Chip tone="seeded" floor={24}>
          unlisted
        </Chip>
        <span>Reachable by URL. Not in the site nav. Robots are told not to index it.</span>
      </p>

      <h1 className="landing-tagline" data-floor="24">
        {TAGLINE}
      </h1>

      <nav className="overview-toc" aria-label="On this page">
        <a className="landing-link" href="#product">
          product
        </a>
        <a className="landing-link" href="#flows">
          flows
        </a>
        <a className="landing-link" href="#architecture">
          architecture
        </a>
      </nav>

      <div className="landing-chips">
        <Chip tone="verified">{CREDENTIAL_LABEL[level]}</Chip>
        <Chip tone="neutral">operator-attested</Chip>
        <Chip tone="neutral">relayed claim · gas paid by Legwork</Chip>
        <Chip tone="neutral">testnet USDC — not spendable</Chip>
        <Chip tone="seeded">1 real · +20 seeded (demo data)</Chip>
      </div>

      <section id="product" className="overview-chapter">
        <h2 className="landing-section-title">Product</h2>
        <p className="landing-prose landing-claim" data-floor="24">
          {claimSentence(level)}
        </p>
        <p className="landing-prose" data-floor="24">
          {LANDING_HERO}
        </p>
        <div className="landing-trust">
          <TrustModel />
        </div>

        <h3 className="overview-subhead">The four task types</h3>
        <p className="landing-prose" data-floor="24">
          Free text is not a task type. A request that is not one of the four leaves the
          enumerated path and is screened as text.
        </p>
        <ul className="agents-types">
          {TASK_TYPES.map((type) => (
            <li key={type} className="agents-type">
              <MonoTag type={type} />
              <span className="landing-prose">
                {TYPE_LINES[type]} Floor {PRICE_FLOOR_USDC[type].toFixed(2)} USDC to the worker.
              </span>
            </li>
          ))}
        </ul>
        <p className="landing-prose" data-floor="24">
          Max {MAX_TASK_AMOUNT_USDC.toFixed(2)} per task. On a 3.00 task the agent pays 3.45, the
          escrow locks 3.45, the worker receives 3.00, the fee is 0.45. Caps: {MAX_OPEN_TASKS_PER_BUYER}{' '}
          open tasks and {DAILY_CAP_USDC} USDC per day per payer.
        </p>

        <h3 className="overview-subhead">What is live and what is seeded</h3>
        <ul className="landing-facts">
          <li>One real registration: the demo worker&apos;s phone.</li>
          <li>The pool reads 1 real · +20 seeded (demo data). Never a combined total.</li>
          <li>Seeded workers cannot produce a verified registration and cannot claim an external task.</li>
          <li>Settlement is Base Sepolia testnet. Mainnet payouts are roadmap.</li>
          <li>
            verify-open, photo-of and call-confirm need a real OpenStreetMap id. Leiria and Lisbon
            resolve from a packaged index; anywhere else resolves live against Overpass, and answers
            503 rather than a guess when Overpass does not.
          </li>
        </ul>
      </section>

      <section id="flows" className="overview-chapter">
        <h2 className="landing-section-title">User and agent flows</h2>
        <p className="landing-prose" data-floor="24">
          Two doors, one escrow. The agent pays before anyone can claim. The worker is paid for
          the proof. A refused task moves no money.
        </p>

        <div className="overview-flows">
          <article className="overview-flow">
            <h3 className="overview-flow-title" data-floor="24">
              Agent
            </h3>
            <p className="landing-prose" data-floor="24">
              {X402_SENTENCE}
            </p>
            <ol className="overview-steps">
              {AGENT_STEPS.map((step, i) => (
                <li key={step.tool} className="overview-step">
                  <StepRail last={i === AGENT_STEPS.length - 1} />
                  <div className="overview-step-body">
                    <p className="overview-step-name mono">{step.tool}</p>
                    <p className="landing-prose">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </article>

          <article className="overview-flow">
            <h3 className="overview-flow-title" data-floor="24">
              Worker
            </h3>
            <p className="landing-prose" data-floor="24">
              Open the mini-app in World App. The money is already locked before the claim button
              exists.
            </p>
            <ol className="overview-steps">
              {WORKER_STEPS.map((step, i) => (
                <li key={step.label} className="overview-step">
                  <StepRail last={i === WORKER_STEPS.length - 1} />
                  <div className="overview-step-body">
                    <p className="overview-step-name">{step.label}</p>
                    <p className="landing-prose">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <a className="landing-link" href={miniappUrl()} data-hit="44">
              Open the worker app ↗
            </a>
          </article>
        </div>

        <h3 className="overview-subhead">Install</h3>
        <p className="agents-mode-label">Hosted</p>
        <pre className="agents-code">
          <code>{hosted}</code>
        </pre>
        <p className="agents-mode-label">Local</p>
        <pre className="agents-code">
          <code>{INSTALL_LINE}</code>
        </pre>

        <h3 className="overview-subhead">Shared lifecycle</h3>
        <p className="landing-prose" data-floor="24">
          Default windows: claim {DEFAULT_CLAIM_TTL_S} s, submit {DEFAULT_SUBMIT_TTL_S} s, dispute{' '}
          {DEFAULT_DISPUTE_WINDOW_S} s ({DEMO_DISPUTE_WINDOW_S} s on the filmed run, disclosed on
          screen). Expiry refunds the buyer. A contested proof goes to operator resolve, which
          charges zero fee on either leg.
        </p>
        <ol className="overview-lifecycle">
          {LIFECYCLE_MAIN.map((status, i) => (
            <li key={status} className="overview-lifecycle-item">
              <StatusBadge status={status} floor={24} />
              {i < LIFECYCLE_MAIN.length - 1 ? (
                <span className="overview-lifecycle-path" aria-hidden="true" />
              ) : null}
            </li>
          ))}
        </ol>
        <p className="overview-lifecycle-forks">
          {LIFECYCLE_FORKS.map((status) => (
            <StatusBadge key={status} status={status} size="sm" floor={24} />
          ))}
        </p>
        <p className="landing-prose" data-floor="24">
          A <span className="mono">refused</span> row never funded an escrow, so it has no path to
          the meter. Release never renders without the proof beside it.
        </p>

        <h3 className="overview-subhead">When a request is refused</h3>
        <ul className="agents-classes">
          {ABUSE_CLASSES.map((cls) => (
            <li key={cls}>{cls}</li>
          ))}
        </ul>
        <p className="landing-prose" data-floor="24">
          Schema error: 4xx, no mark, no money. Well-formed request that hits one of the six
          classes: 422, mark on the payer&apos;s ERC-8004 identity, no money. The tag is{' '}
          <span className="mono">task-refused</span>.
        </p>
        <p className="landing-prose mono" data-floor="24">
          {NO_RETRY_SENTENCE}
        </p>
      </section>

      <section id="architecture" className="overview-chapter">
        <h2 className="landing-section-title">Technical architecture</h2>
        <p className="landing-prose" data-floor="24">
          Request in at the top. Money and records at the bottom. Private state stays off the
          public index.
        </p>

        <ol className="overview-stack">
          {LAYERS.map((layer, i) => (
            <li key={layer.role} className="overview-layer">
              <StepRail last={i === LAYERS.length - 1} end="dot" />
              <div className="overview-step-body">
                <p className="landing-section-title">{layer.role}</p>
                <h3 className="overview-flow-title" data-floor="24">
                  {layer.title}
                </h3>
                <p className="landing-prose" data-floor="24">
                  {layer.body}
                </p>
                <ul className="overview-layer-items">
                  {layer.items.map((item) => (
                    <li key={item}>
                      <span className="mono">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>

        <h3 className="overview-subhead">POST /tasks, in order</h3>
        <p className="landing-prose" data-floor="24">
          Verify comes first and moves nothing. Settle happens after post, and only there. A
          failed post answers 503 without charging. Our custody is the one block between
          settlement and escrow, and we say so.
        </p>
        <ol className="overview-order">
          {POST_ORDER.map((step) => (
            <li key={step}>
              <span className="mono">{step}</span>
            </li>
          ))}
        </ol>

        <h3 className="overview-subhead">Screening pipeline</h3>
        <ol className="overview-order">
          {SCREEN_STEPS.map((step) => (
            <li key={step} className="landing-prose">
              {step}
            </li>
          ))}
        </ol>

        <h3 className="overview-subhead">Ours, on Base Sepolia</h3>
        <table className="agents-table overview-addr">
          <thead>
            <tr>
              <th>contract</th>
              <th>address</th>
            </tr>
          </thead>
          <tbody>
            {OURS.map((row) => (
              <tr key={row.name}>
                <td className="mono">{row.name}</td>
                <td>
                  <a className="landing-link" href={basescan(row.address)}>
                    {row.address} ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="overview-subhead">Live, not ours</h3>
        <table className="agents-table overview-addr">
          <thead>
            <tr>
              <th>what</th>
              <th>address</th>
            </tr>
          </thead>
          <tbody>
            {NOT_OURS.map((row) => (
              <tr key={row.name}>
                <td className="mono">{row.name}</td>
                <td>
                  <a className="landing-link" href={basescan(row.address)}>
                    {row.address} ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="landing-prose" data-floor="24">
          Also live and not ours: World ID (Developer Portal, IDKit 4.x), the x402 reference
          facilitator, OpenStreetMap / Overpass, The Graph Studio.
        </p>

        <h3 className="overview-subhead">Hosts</h3>
        <ul className="agents-more">
          <li>
            <a className="landing-link" href={dashboardUrl()}>
              {dashboardUrl()}
            </a>
          </li>
          <li>
            <a className="landing-link" href={apiUrl()}>
              {apiUrl()}
            </a>
          </li>
          <li>
            <a className="landing-link" href={`${apiUrl()}/mcp`}>
              {apiUrl()}/mcp
            </a>
          </li>
          <li>
            <a className="landing-link" href={miniappUrl()}>
              {miniappUrl()}
            </a>
          </li>
          <li>
            <a className="landing-link" href={GITHUB_REPO}>
              {GITHUB_REPO} ↗
            </a>
          </li>
        </ul>
      </section>
    </main>
  );
}
