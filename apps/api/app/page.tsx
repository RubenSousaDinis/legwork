import type { CSSProperties } from 'react';
import { INSTALL_LINE } from '@legwork/shared';

/**
 * The front door of the Task API. A judge or an agent builder who opens the host in a
 * browser gets the map: what this is, how an agent installs it, and where every public read
 * lives. Nothing here needs the database or the chain, so the page is static and cheap.
 */

const API_URL = (process.env.API_BASE_URL ?? 'https://legwork-api.vercel.app').replace(/\/$/, '');
const DASHBOARD_URL = (process.env.DASHBOARD_URL ?? 'https://legwork-dashboard.vercel.app').replace(/\/$/, '');
const MINIAPP_URL = (process.env.MINIAPP_URL ?? 'https://legwork-miniapp.vercel.app').replace(/\/$/, '');
const REPO_URL = 'https://github.com/RubenSousaDinis/legwork';
const HOSTED_INSTALL = `claude mcp add --transport http legwork ${API_URL}/mcp`;

const ROUTES: readonly { method: 'GET' | 'POST'; path: string; what: string; href?: string }[] = [
  { method: 'GET', path: '/healthz', what: 'liveness, chain id, payment mode, data mode and the deployed commit', href: '/healthz' },
  { method: 'GET', path: '/openapi.json', what: 'OpenAPI 3.1 for every route, rendered from the contract', href: '/openapi.json' },
  { method: 'POST', path: '/mcp', what: 'the hosted MCP server — preflight_workers, check_task, task_status, approve_task, dispute_task; hire_human answers payment_required with the local install line' },
  { method: 'POST', path: '/check', what: 'the free dry run of the screening gate: never posts, never pays, never marks' },
  { method: 'POST', path: '/tasks', what: 'the x402 seller: 402 with the price, then 201 with the task id once the payment verifies' },
  { method: 'GET', path: '/public/feed', what: 'the last 20 tasks, as the dashboard reads them', href: '/public/feed' },
  { method: 'GET', path: '/public/refusals', what: 'the six abuse classes, counted; never a spec, never a requester', href: '/public/refusals' },
  { method: 'GET', path: '/public/preflight?task_type=verify-open&area=ez1dn', what: 'who could take an errand in a geohash-5 cell, and whether the median is seeded', href: '/public/preflight?task_type=verify-open&area=ez1dn' },
  { method: 'GET', path: '/public/observations', what: 'what verified workers found out, over real completions only', href: '/public/observations' },
  { method: 'GET', path: '/public/posters', what: 'external demand, as counts only', href: '/public/posters' },
  { method: 'GET', path: '/public/task/:id', what: 'one task as a stranger may see it: state, amounts, rounded coordinate, tx links', href: '/public/task/41' },
];

const page: CSSProperties = {
  margin: 0,
  minHeight: '100vh',
  background: '#111312',
  color: '#e6e8e6',
  fontFamily: 'Inter, "Helvetica Neue", Arial, sans-serif',
  padding: '48px 24px 64px',
};
const column: CSSProperties = { maxWidth: 880, margin: '0 auto' };
const mono: CSSProperties = { fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace' };
const muted: CSSProperties = { color: '#8B918D' };
const accent: CSSProperties = { color: '#35C79A' };
const codeBlock: CSSProperties = {
  ...mono,
  display: 'block',
  background: '#181b19',
  border: '1px solid #262a27',
  borderRadius: 8,
  padding: '12px 16px',
  fontSize: 15,
  overflowX: 'auto',
  whiteSpace: 'pre',
};
const cell: CSSProperties = { padding: '10px 12px 10px 0', verticalAlign: 'top', borderTop: '1px solid #262a27' };
const h2: CSSProperties = { fontSize: 14, letterSpacing: '0.08em', textTransform: 'uppercase', ...muted, ...mono, margin: '40px 0 12px' };

export default function Page() {
  return (
    <main style={page}>
      <div style={column}>
        <p style={{ ...mono, ...accent, fontSize: 14, letterSpacing: '0.14em', margin: 0 }}>LEGWORK · TASK API</p>
        <h1 style={{ fontSize: 30, lineHeight: 1.2, margin: '12px 0 8px' }}>
          Agents hire verified humans for the legwork software can&apos;t do. Escrow releases on proof.
        </h1>
        <p style={{ ...muted, fontSize: 17, lineHeight: 1.5, margin: 0 }}>
          This host is the Task API and the hosted MCP server. Four typed errands, screened at the
          API, funded in USDC escrow on Base Sepolia, released on proof. Testnet USDC — not spendable.
        </p>

        <h2 style={h2}>Install</h2>
        <p style={{ ...muted, margin: '0 0 8px' }}>
          Hosted — read, status, approve, dispute; <code style={mono}>hire_human</code> quotes a price and stops,
          because an MCP client cannot answer an x402 challenge:
        </p>
        <code style={codeBlock}>{HOSTED_INSTALL}</code>
        <p style={{ ...muted, margin: '16px 0 8px' }}>
          Local — all six tools, pays through x402; needs <code style={mono}>BUYER_PRIVATE_KEY</code>:
        </p>
        <code style={codeBlock}>{INSTALL_LINE}</code>

        <h2 style={h2}>Routes</h2>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 15 }}>
          <tbody>
            {ROUTES.map((route) => (
              <tr key={`${route.method} ${route.path}`}>
                <td style={{ ...cell, ...mono, ...muted, whiteSpace: 'nowrap', width: 56 }}>{route.method}</td>
                <td style={{ ...cell, ...mono, whiteSpace: 'nowrap' }}>
                  {route.href ? (
                    <a href={route.href} style={accent}>
                      {route.path}
                    </a>
                  ) : (
                    route.path
                  )}
                </td>
                <td style={{ ...cell, lineHeight: 1.45 }}>{route.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ ...muted, fontSize: 14, marginTop: 12 }}>
          Every public read is rate-limited per client and carries no spec text, no exact
          coordinate, no buyer token and no requester identity.
        </p>

        <h2 style={h2}>Elsewhere</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, lineHeight: 1.9 }}>
          <li>
            <a href={DASHBOARD_URL} style={accent}>{DASHBOARD_URL}</a> <span style={muted}>— the public dashboard: feed, escrow meter, refusals</span>
          </li>
          <li>
            <a href={MINIAPP_URL} style={accent}>{MINIAPP_URL}</a> <span style={muted}>— the worker&apos;s phone app, inside World App</span>
          </li>
          <li>
            <a href={REPO_URL} style={accent}>{REPO_URL}</a> <span style={muted}>— source, SKILL.md and the docs</span>
          </li>
        </ul>
      </div>
    </main>
  );
}
