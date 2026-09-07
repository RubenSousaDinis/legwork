#!/usr/bin/env node
/**
 * `npx @legwork/mcp` — the local, paying MCP server, and the one place a buyer key is read.
 *
 * Claude Code's MCP client cannot answer an x402 challenge, so the hosted server at `/mcp`
 * quotes a price and stops. This binary is the honest other half: it holds
 * `BUYER_PRIVATE_KEY`, builds a paying `fetch` once at start-up and hands it to `hire_human`
 * alone. The other five tools keep the plain `fetch` — a read has nothing to pay for, and a
 * credential that cannot be attached cannot leak.
 *
 * **stdout is the MCP protocol.** Every diagnostic, and the terminal insert, goes to stderr.
 * The two commands that are not a server — `--help` and `hire` — write to stdout because
 * nothing is speaking MCP over it.
 *
 * The key is read here, from the environment, once. Never a flag: a flag is in the shell
 * history, in `ps` output and in the transcript of anyone filming their terminal.
 */
import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Hex } from 'viem';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { INSTALL_LINE } from '@legwork/shared';
import {
  DEFAULT_API_BASE,
  DEFAULT_DASHBOARD_URL,
  toolContext,
  type LegworkMcpOptions,
  type LocalHireHandler,
  type McpMode,
  type SubgraphSource,
} from '../src/context';
import { FileTokenStore } from '../src/keychain';
import { createLegworkMcp } from '../src/server';
import { createPayFetch, insertLines, localHire } from '../src/tools/hire';

export const MISSING_KEY =
  'BUYER_PRIVATE_KEY is not set (read from the environment only; never passed as a flag)';

export const EXIT_OK = 0;
export const EXIT_REFUSED = 1;
export const EXIT_ERROR = 2;

/**
 * Never prints a key, and never prints an address derived from one: `--help` is the first
 * thing anyone pastes into an issue.
 */
export const HELP_TEXT = `legwork-mcp — hire a human from an agent, over MCP.

Usage
  legwork-mcp                       start the stdio server in local mode (pays)
  legwork-mcp --mode hosted         start the stdio server in hosted mode (never pays)
  legwork-mcp hire <envelope.json>  post one task now and print the insert
  legwork-mcp --help                this text

Modes
  local    all six tools. hire_human pays POST /tasks with x402 and returns a task id.
           Needs BUYER_PRIVATE_KEY. The buyer token it gets back is stored for you.
  hosted   the same six tools, no key, no payment. hire_human answers payment_required
           with a price and the install line, and never claims to have posted anything.

Install
  ${INSTALL_LINE}
  from source: claude mcp add legwork -- node <repo>/packages/mcp/dist/bin/legwork-mcp.js

Environment
  BUYER_PRIVATE_KEY     the buyer key, local mode only. Read from the environment, never
                        from a flag, never logged, never printed here.
  LEGWORK_API_URL       Task API origin       (default ${DEFAULT_API_BASE})
  LEGWORK_DASHBOARD_URL dashboard origin      (default ${DEFAULT_DASHBOARD_URL})
  SUBGRAPH_QUERY_URL    optional; without it preflight_workers asks the API instead
  LEGWORK_INSERT        1 prints the three-line terminal insert per hire, to stderr

Buyer tokens
  ~/.legwork/tokens.json, mode 0600 in a 0700 directory: task id to buyer token, and
  nothing else. approve_task and dispute_task read it. From another machine, pass the
  buyer_token argument instead.

Money
  The worker keeps the whole posted rate and the agent pays the 15 % fee on top: a 3.00
  errand costs the agent 3.45, the escrow locks 3.45, the worker receives 3.00 and the fee
  is 0.45. Testnet USDC on Base Sepolia.
`;

export interface Io {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}

const writeLine = (stream: NodeJS.WritableStream, line: string): void => {
  stream.write(`${line}\n`);
};

/**
 * The subgraph, as a plain GraphQL POST. `preflight_workers` needs one method and this
 * package has no client dependency; the API's `/public/preflight` is the fallback when
 * `SUBGRAPH_QUERY_URL` is unset, and it runs the same computation server-side.
 */
function subgraphSource(url: string): SubgraphSource {
  return {
    async query<T>(document: string, variables?: Record<string, unknown>): Promise<T> {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: document, variables: variables ?? {} }),
      });
      const payload = (await response.json()) as { data?: T; errors?: { message: string }[] };
      if (payload.errors?.length) throw new Error('the subgraph answered with errors');
      if (!payload.data) throw new Error('the subgraph answered with no data');
      return payload.data;
    },
  };
}

/**
 * Wraps the paying hire so a successful one prints its three lines. The handler itself is
 * pure and reads no environment; this is the only place that knows about `LEGWORK_INSERT`
 * and about which stream the lines belong on.
 */
export function withInsert(
  handler: LocalHireHandler,
  enabled: boolean,
  out: NodeJS.WritableStream,
): LocalHireHandler {
  if (!enabled) return handler;
  return async (input, ctx) => {
    const result = await handler(input, ctx);
    for (const line of insertLines(input, result)) writeLine(out, line);
    return result;
  };
}

interface Settings {
  apiBase: string;
  dashboardUrl: string;
  subgraph?: SubgraphSource;
  insert: boolean;
}

function settingsFrom(env: NodeJS.ProcessEnv): Settings {
  const subgraphUrl = env.SUBGRAPH_QUERY_URL?.trim();
  return {
    apiBase: env.LEGWORK_API_URL?.trim() || DEFAULT_API_BASE,
    dashboardUrl: env.LEGWORK_DASHBOARD_URL?.trim() || DEFAULT_DASHBOARD_URL,
    ...(subgraphUrl ? { subgraph: subgraphSource(subgraphUrl) } : {}),
    insert: env.LEGWORK_INSERT === '1',
  };
}

/** The key, or nothing. Read once, in this function, and passed on as an argument. */
function buyerKey(env: NodeJS.ProcessEnv): Hex | null {
  const raw = env.BUYER_PRIVATE_KEY?.trim();
  return raw ? (raw as Hex) : null;
}

// ------------------------------------------------------------------ commands

async function serve(mode: McpMode, env: NodeJS.ProcessEnv, io: Io): Promise<number> {
  const settings = settingsFrom(env);
  const options: LegworkMcpOptions = {
    mode,
    apiBase: settings.apiBase,
    dashboardUrl: settings.dashboardUrl,
    ...(settings.subgraph ? { subgraph: settings.subgraph } : {}),
    tokenStore: new FileTokenStore(),
    fetchImpl: fetch,
  };

  if (mode === 'local') {
    const key = buyerKey(env);
    if (!key) {
      writeLine(io.stderr, MISSING_KEY);
      return EXIT_ERROR;
    }
    // Built once, at start-up, and reachable only from `hire_human`.
    const payFetch = createPayFetch(key);
    const paying: LocalHireHandler = (input, hireCtx) =>
      localHire(input, { ...hireCtx, fetch: payFetch });
    options.hireHuman = withInsert(paying, settings.insert, io.stderr);
  }

  const server = createLegworkMcp(options);
  await server.connect(new StdioServerTransport());
  writeLine(io.stderr, `legwork-mcp: ${mode} mode on ${settings.apiBase}`);
  return EXIT_OK;
}

/**
 * One hire outside the MCP loop: the input to the filmed insert. The lines go to stdout
 * here — nothing is speaking MCP over it — and the exit code says what happened, so a
 * script can tell a refusal from an outage without parsing prose.
 */
async function hireOnce(file: string, env: NodeJS.ProcessEnv, io: Io): Promise<number> {
  const settings = settingsFrom(env);
  const key = buyerKey(env);
  if (!key) {
    writeLine(io.stderr, MISSING_KEY);
    return EXIT_ERROR;
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(await readFile(file, 'utf8')) as unknown;
  } catch {
    writeLine(io.stderr, `legwork-mcp: cannot read ${file} as JSON`);
    return EXIT_ERROR;
  }

  const ctx = toolContext({
    mode: 'local',
    apiBase: settings.apiBase,
    dashboardUrl: settings.dashboardUrl,
    tokenStore: new FileTokenStore(),
    fetchImpl: createPayFetch(key),
  });

  const input = envelope as Parameters<LocalHireHandler>[0];
  const result = await localHire(input, ctx);
  const record = result as unknown as Record<string, unknown>;

  if (record.refused === true) {
    writeLine(io.stderr, `→ 422 refused · ${String(record.rule_id)} · moves no money`);
    writeLine(io.stderr, String(record.message));
    return EXIT_REFUSED;
  }
  if (record.isError === true) {
    writeLine(io.stderr, `legwork-mcp: ${String(record.error)}`);
    return EXIT_ERROR;
  }

  for (const line of insertLines(input, result)) writeLine(io.stdout, line);
  return EXIT_OK;
}

// -------------------------------------------------------------------- argv

const HELP_FLAGS = new Set(['--help', '-h', 'help']);

/** By hand, on purpose: an argument parser is not worth a dependency for four shapes. */
export async function main(argv: string[], env: NodeJS.ProcessEnv, io: Io): Promise<number> {
  const [first, second] = argv;

  if (first !== undefined && HELP_FLAGS.has(first)) {
    io.stdout.write(HELP_TEXT);
    return EXIT_OK;
  }

  if (first === 'hire') {
    if (!second) {
      writeLine(io.stderr, 'legwork-mcp: hire needs a path to an envelope JSON file');
      return EXIT_ERROR;
    }
    return hireOnce(second, env, io);
  }

  if (first === '--mode') {
    if (second !== 'local' && second !== 'hosted') {
      writeLine(io.stderr, 'legwork-mcp: --mode takes local or hosted');
      return EXIT_ERROR;
    }
    return serve(second, env, io);
  }

  if (first !== undefined) {
    writeLine(io.stderr, `legwork-mcp: unknown argument ${first} (try --help)`);
    return EXIT_ERROR;
  }

  return serve('local', env, io);
}

function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  const code = await main(process.argv.slice(2), process.env, {
    stdout: process.stdout,
    stderr: process.stderr,
  });
  // A running server exits when its transport does; anything else is done here.
  if (code !== EXIT_OK) process.exit(code);
}
