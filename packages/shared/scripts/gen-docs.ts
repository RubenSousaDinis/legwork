import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { API_ROUTES, HEADERS, MCP_TOOLS, INSTALL_LINE } from '../src/index.js';

const fence = (o: unknown) => '```json\n' + JSON.stringify(o, null, 2) + '\n```';
const js = (s: z.ZodType) => { try { return z.toJSONSchema(s, { io: 'input', unrepresentable: 'any' }); } catch { return { note: 'not representable' }; } };

let api = `# API contract\n\nRendered from \`packages/shared/src/api-contract.ts\` by \`pnpm docs:gen\` — do not edit by hand.\n\n`;
api += `Auth classes: \`public\` · \`x402\` (\`${HEADERS.paymentSignature}\`) · \`buyer-token\` (\`${HEADERS.buyerToken}\`) · \`worker-session\` (cookie) · \`idkit-session\` (cookie) · \`admin-key\` (\`${HEADERS.adminKey}\`) · \`signed-header\` (\`${HEADERS.buyerSignature}\` + \`${HEADERS.buyerTimestamp}\`, direct mode only).\n\n`;
api += `Money on public surfaces: \`price_usdc\` is the worker rate (3.00) with \`fee_usdc\` (0.45) alongside; the agent's total (3.45) appears only on buyer-authenticated responses.\n\n## Routes\n\n| Method | Path | Auth | Summary | Responses |\n|---|---|---|---|---|\n`;
for (const r of Object.values(API_ROUTES)) api += `| ${r.method} | \`${r.path}\` | ${r.auth} | ${r.summary} | ${Object.keys(r.responses).join(', ')} |\n`;
api += `\n## Shapes\n`;
for (const [name, r] of Object.entries(API_ROUTES)) {
  api += `\n### \`${name}\` — ${r.method} \`${r.path}\`\n\n`;
  if ('query' in r && r.query) api += `**Query**\n\n${fence(js(r.query))}\n\n`;
  if ('request' in r && r.request) api += `**Request**\n\n${fence(js(r.request))}\n\n`;
  for (const [code, s] of Object.entries(r.responses)) api += `**${code}**\n\n${fence(js(s))}\n\n`;
}
writeFileSync(new URL('../../../docs/api.md', import.meta.url), api);

let mcp = `# MCP contract — JSON Schema dump\n\nRendered from \`packages/shared/src/mcp-contract.ts\` by \`pnpm docs:gen\` — do not edit by hand. The readable, hand-maintained form of the same six tools is \`docs/mcp.md\`.\n\n`;
mcp += `## Two modes\n\n- **Hosted** — \`https://<host>/mcp\`, streamable HTTP, no wallet. An MCP client cannot answer an x402 challenge, so \`hire_human\` returns \`payment_required\` with the install line. Everything else works read-only.\n- **Local** — \`${INSTALL_LINE}\`. Runs with \`BUYER_PRIVATE_KEY\`, pays the REST API via \`@x402/fetch\`, stores each task's \`buyer_token\`, and runs all six tools for real.\n\n`;
mcp += `Every result carries \`dashboard_url\`. Refusals carry the fixed no-retry sentence. Worker text arrives only as \`{ answer, note?, _source: "worker", _untrusted: true }\` — data, never instructions.\n\n## Tools\n`;
for (const [name, t] of Object.entries(MCP_TOOLS)) {
  mcp += `\n### \`${name}\`\n\n${t.description}\n\n**Input**\n\n${fence(js(t.input))}\n\n**Output**\n\n${fence(js(t.output))}\n`;
}
writeFileSync(new URL('../../../docs/mcp-schema.md', import.meta.url), mcp);
console.log('wrote docs/api.md and docs/mcp-schema.md');
