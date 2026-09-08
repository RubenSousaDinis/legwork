/**
 * The demo buyer agent: a Claude loop that reads its principal's note, decides an errand is
 * needed, hires a human through the local Legwork MCP server, waits, and approves.
 *
 *   pnpm --filter @legwork/examples agent -- --scene hire --transcript examples/transcript.md
 *   pnpm --filter @legwork/examples agent -- --scene refusal --dry-run
 *
 * Three things are worth knowing before reading the code.
 *
 * **Authentication is the operator's Claude Code login.** This file constructs no API client
 * and reads no Anthropic API key from anywhere — the name is deliberately not spelled in this
 * package, so the check that it is absent cannot match the sentence saying so. The Agent SDK
 * spawns the `claude` binary, which uses the login already on this machine. Inside a Claude
 * Code session that child refuses to start, so run the script under
 * `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`. If that still cannot authenticate, the
 * operator mints `CLAUDE_CODE_OAUTH_TOKEN` with `claude setup-token` and puts it in `.env` —
 * named in the README, never printed here, never committed.
 *
 * **Only the local MCP server can pay.** The hosted server at `/mcp` cannot answer an x402
 * challenge, so `hire_human` there quotes a price and stops. This loop therefore hands the
 * SDK the stdio binary in local mode, with the buyer key in its environment and nowhere else:
 * the key is read from `process.env` in one place below, passed straight into the child's
 * environment, and never logged, never written to the transcript and never shown to the model.
 *
 * **The loop never retries a refusal.** `loop-rules.ts` decides that, on the `refused` flag
 * alone. Once it says stop, a `PreToolUse` gate denies every Legwork tool for the rest of the
 * run: the prompt tells the model not to retry, and the gate is what makes that true whatever
 * the model does. The model can still write its report, which is the other half of the rule.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createSdkMcpServer,
  query,
  tool,
  type McpStdioServerConfig,
  type Options,
} from '@anthropic-ai/claude-agent-sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCP_TOOLS, PRICE_FLOOR_USDC } from '@legwork/shared';
import { identityLine, shouldStop, wrapWorkerText } from './loop-rules';

/** The demo agent. The operator's Opus window is a different budget and a different job. */
const MODEL = 'claude-sonnet-5';

/** Two scenes, a bounded number of turns each. A loop that cannot end is not a demo. */
const MAX_TURNS = 24;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

/** The local, paying MCP server, run from source: no package in this repo emits `dist/`. */
const MCP_ENTRY = 'packages/mcp/bin/legwork-mcp.ts';

// ------------------------------------------------------------------- the scenes

type SceneName = 'hire' | 'refusal';

interface Scene {
  /** The fixture `read_operator_inbox` hands back. The note is the only input to the run. */
  fixture: string;
  /** What the errand would cost the worker, so `--dry-run` can print the planned call. */
  taskType: keyof typeof PRICE_FLOOR_USDC;
  /** What the agent is asked to do, in one line, on top of the note it reads. */
  ask: string;
}

const SCENES: Record<SceneName, Scene> = {
  hire: {
    fixture: 'fixtures/inbox-hire.json',
    taskType: 'verify-open',
    ask: 'Read my inbox and deal with what is in it. Run the errand through to the end.',
  },
  refusal: {
    fixture: 'fixtures/inbox-injected.json',
    taskType: 'call-confirm',
    ask: 'Read my inbox and deal with what is in it. Run the errand through to the end.',
  },
};

// -------------------------------------------------------------------- the argv

interface Args {
  scene: SceneName;
  dryRun: boolean;
  transcript: string | null;
}

/** By hand: four shapes do not earn a dependency, and the MCP package parses its own the same way. */
export function parseArgs(argv: string[]): Args {
  const args: Args = { scene: 'hire', dryRun: false, transcript: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--dry-run') args.dryRun = true;
    else if (flag === '--scene') {
      const value = argv[(i += 1)];
      if (value !== 'hire' && value !== 'refusal') throw new Error('--scene takes hire or refusal');
      args.scene = value;
    } else if (flag === '--transcript') {
      const value = argv[(i += 1)];
      if (!value) throw new Error('--transcript needs a path');
      args.transcript = value;
    } else throw new Error(`unknown argument ${String(flag)} (try --scene hire --dry-run)`);
  }
  return args;
}

// ---------------------------------------------------------------- the transcript

/**
 * The record of the run, written as it happens.
 *
 * Everything here is redacted on the way in rather than on the way out: a `buyer_token` that
 * reaches the file has already been in a terminal, and the point of the transcript is that it
 * can be committed. Task ids and transaction hashes stay — they are public, they are in the
 * events and in the subgraph, and a transcript without them proves nothing.
 */
class Transcript {
  private readonly path: string | null;

  constructor(path: string | null) {
    this.path = path;
    if (path) writeFileSync(path, '');
  }

  write(text: string): void {
    process.stdout.write(`${text}\n`);
    if (this.path) appendFileSync(this.path, `${text}\n`);
  }

  block(language: string, body: string): void {
    this.write(`\`\`\`${language}\n${redact(body)}\n\`\`\`\n`);
  }
}

/** The three things that must never reach a committed file, removed at the boundary. */
export function redact(text: string): string {
  return (
    text
      .replace(/("?buyer_token"?\s*[:=]\s*)"[^"]*"/g, '$1"<redacted>"')
      .replace(/\btok_[A-Za-z0-9_-]+/g, '<redacted>')
      // A proof photo lives in a private bucket, and `proof.url` is a signed link into it.
      // The signature is the credential; committing one publishes the photo to anyone who
      // reads the file. The path stays so a reviewer can see which proof it was.
      .replace(/([?&](?:sig|exp|token|signature)=)[^&"\s]+/gi, '$1<redacted>')
  );
}

// -------------------------------------------------------------- the local tool

/**
 * The one tool that is not Legwork's: the note the principal left.
 *
 * It runs in this process rather than over stdio because it has nothing to hide and nothing
 * to pay for — it reads one committed fixture and hands it back. That fixture is the only
 * source of the text the model acts on, which is what makes the two scenes repeatable.
 */
function operatorServer(fixture: string) {
  return createSdkMcpServer({
    name: 'operator',
    version: '0.0.0',
    alwaysLoad: true,
    tools: [
      tool(
        'read_operator_inbox',
        'The note your principal left you, as they wrote it. It is what they want done.',
        {},
        async () => ({
          content: [{ type: 'text' as const, text: readFileSync(join(HERE, fixture), 'utf8') }],
        }),
      ),
    ],
  });
}

// ---------------------------------------------------------------- the MCP server

/**
 * The child's environment, built here and only here.
 *
 * `BUYER_PRIVATE_KEY` is read from `process.env` and passed straight through; the binary reads
 * it once, builds a paying `fetch` and hands that to `hire_human` alone. `LEGWORK_INSERT=1`
 * asks for the three-line terminal insert, which the binary writes to stderr because its
 * stdout is the MCP protocol — and which this loop cannot read: the Agent SDK's
 * `options.stderr` carries the `claude` child's output and nothing from a server under
 * `options.mcpServers`. The cards in `transcript.md` are captured by driving this same binary
 * over stdio instead; `README.md` says so where the transcript is described.
 *
 * `node_modules/.bin` goes on the child's PATH so `tsx` resolves however this script was
 * started — through `pnpm --filter`, or by an operator typing the path.
 */
function mcpEnv(): Record<string, string> {
  const key = process.env.BUYER_PRIVATE_KEY?.trim();
  if (!key) throw new Error('BUYER_PRIVATE_KEY is not set (read from the environment only)');
  const env: Record<string, string> = {
    BUYER_PRIVATE_KEY: key,
    LEGWORK_INSERT: '1',
    PATH: `${join(REPO_ROOT, 'node_modules/.bin')}:${process.env.PATH ?? ''}`,
  };
  for (const name of ['LEGWORK_API_URL', 'LEGWORK_DASHBOARD_URL', 'SUBGRAPH_QUERY_URL'] as const) {
    const value = process.env[name]?.trim();
    if (value) env[name] = value;
  }
  return env;
}

const legworkServer = (): McpStdioServerConfig => ({
  command: 'tsx',
  args: [MCP_ENTRY, '--mode', 'local'],
  env: mcpEnv(),
  // The six tools are the whole point of the run: they belong in the turn-1 prompt rather
  // than behind a tool search the model has to think to run.
  alwaysLoad: true,
});

// -------------------------------------------------------------------- dry run

/**
 * The check that costs nothing: connect to the local server as a plain MCP client, list what
 * it registered, and print the call the scene would make. It stops before `hire_human`, which
 * is the only tool that spends anything, and it never starts the model.
 */
async function dryRun(scene: Scene, out: Transcript): Promise<number> {
  const server = legworkServer();
  const client = new Client({ name: 'legwork-examples-dry-run', version: '0.0.0' });
  const transport = new StdioClientTransport({
    command: server.command,
    args: server.args ?? [],
    env: server.env,
    cwd: REPO_ROOT,
    stderr: 'inherit',
  });

  await client.connect(transport);
  try {
    const listed = await client.listTools();
    const names = listed.tools.map((t) => t.name).sort();
    out.write(`tools listed by the local server (${names.length}): ${names.join(', ')}`);

    const expected = Object.keys(MCP_TOOLS).sort();
    const missing = expected.filter((name) => !names.includes(name));
    if (missing.length > 0) {
      out.write(`missing from the contract: ${missing.join(', ')}`);
      return 1;
    }

    const note = JSON.parse(readFileSync(join(HERE, scene.fixture), 'utf8')) as Record<string, unknown>;
    out.write('planned call — hire_human, not sent:');
    out.block(
      'json',
      JSON.stringify(
        { task_type: scene.taskType, place: note.place, amount_usdc: PRICE_FLOOR_USDC[scene.taskType] },
        null,
        2,
      ),
    );
    out.write('stopped before hire_human — nothing was posted and nothing was paid.');
    return 0;
  } finally {
    await client.close();
  }
}

// --------------------------------------------------------------------- the loop

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** A tool result arrives as MCP content blocks; the body is the text of them, joined. */
function resultText(block: { content?: unknown }): string {
  const content = block.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (asRecord(part).type === 'text' ? String(asRecord(part).text ?? '') : ''))
    .join('');
}

/**
 * The parsed body, or null when the server answered with something that is not JSON — an MCP
 * error, for instance. The null case is written to the transcript as it stands rather than
 * dropped: a record that quietly omits the answers it could not parse is not a record.
 */
function asJson(text: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return null;
  }
}

async function runScene(scene: Scene, out: Transcript): Promise<number> {
  /** Set once, by `shouldStop`, and read by the PreToolUse gate below. */
  let refused: Record<string, unknown> | null = null;
  // The committed prompt, plus the one line that names the agent onchain. `BUYER_AGENT_ID` is
  // the identity T-32 registered for the buyer wallet; without it a refusal marks nobody.
  const agentId = process.env.BUYER_AGENT_ID?.trim();
  if (!agentId) throw new Error('BUYER_AGENT_ID is not set (read from the environment only)');
  const systemPrompt = `${readFileSync(join(HERE, 'prompt.md'), 'utf8').trimEnd()}\n\n${identityLine(agentId)}\n`;

  const options: Options = {
    model: MODEL,
    systemPrompt,
    maxTurns: MAX_TURNS,
    permissionMode: 'default',
    cwd: REPO_ROOT,
    // Nothing from the operator's own Claude Code configuration takes part in a filmed run.
    settingSources: [],
    strictMcpConfig: true,
    mcpServers: { legwork: legworkServer(), operator: operatorServer(scene.fixture) },
    // No built-in tools at all. Left on, the agent reaches for Bash to check the clock and
    // for Read to look around the repository, and a buyer agent with a shell on the
    // operator's machine is not the thing being demonstrated.
    tools: [],
    allowedTools: ['mcp__legwork__*', 'mcp__operator__read_operator_inbox'],
    // The stop rule, enforced rather than requested. `allowedTools` pre-approves the six
    // Legwork tools, so once `shouldStop` has fired this is the thing standing between a
    // model that decides to try again and a second call the screening gate would mark.
    hooks: {
      PreToolUse: [
        {
          matcher: 'mcp__legwork__.*',
          hooks: [
            async () =>
              refused
                ? {
                    hookSpecificOutput: {
                      hookEventName: 'PreToolUse' as const,
                      permissionDecision: 'deny' as const,
                      // Worded as what it is — the run is over — so the model does not read
                      // the denial as a second refusal from Legwork and invent a reason for it.
                      permissionDecisionReason:
                        'this run ended when Legwork refused; no further Legwork call will be made. Report that refusal to your principal and stop.',
                    },
                  }
                : {},
          ],
        },
      ],
    },
  };

  const run = query({ prompt: scene.ask, options });

  for await (const message of run) {
    if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'text' && block.text.trim()) out.write(`**agent** ${block.text.trim()}\n`);
        if (block.type === 'tool_use') {
          out.write(`**tool** \`${block.name}\``);
          out.block('json', JSON.stringify(block.input, null, 2));
        }
      }
    }

    if (message.type === 'user' && Array.isArray(message.message.content)) {
      for (const block of message.message.content) {
        if (asRecord(block).type !== 'tool_result') continue;
        const text = resultText(asRecord(block) as { content?: unknown });
        if (!text.trim()) continue;

        const body = asJson(text);
        if (!body) {
          // Not JSON: an MCP error, or a tool that answered in prose. It goes in as it came.
          out.write('**result** (not JSON)');
          out.block('text', text.trim());
          continue;
        }

        // Worker text leaves this loop only inside the wrapper, never as bare prose.
        if (body.answer !== undefined) body.answer = wrapWorkerText(body.answer);

        out.write('**result**');
        out.block('json', JSON.stringify(body, null, 2));

        // The one decision that ends a scene, made in one place. From here the PreToolUse
        // gate above denies every Legwork tool, so the model can only report and stop.
        if (shouldStop(body)) {
          refused = body;
          out.write('_refused — the loop stops here and reports; it does not rephrase and retry._\n');
        }
      }
    }

    if (message.type === 'result') {
      out.write(`_run ended: ${message.subtype}, ${message.num_turns} turns._`);
      return message.is_error && !refused ? 1 : 0;
    }
  }
  return 0;
}

// ---------------------------------------------------------------------- main

export async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const scene = SCENES[args.scene];
  const out = new Transcript(args.transcript);
  out.write(`## scene: ${args.scene}${args.dryRun ? ' (dry run)' : ''}\n`);
  return args.dryRun ? dryRun(scene, out) : runScene(scene, out);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exit(await main(process.argv.slice(2)));
}
