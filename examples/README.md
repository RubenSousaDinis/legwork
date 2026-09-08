# examples — the demo buyer agent

A Claude loop that reads its principal's note, decides the answer needs someone to walk in and
look, hires a human through Legwork, waits, and reports back. It is the buyer side of the
filmed story and the source of the two terminal cards.

| File | What it is |
| --- | --- |
| `agent.ts` | The loop. Claude Agent SDK `query()`, with the local Legwork MCP server handed to it as `options.mcpServers.legwork`. |
| `prompt.md` | The system prompt, committed so a reader can check what the model was told. |
| `loop-rules.ts` | `shouldStop` and `wrapWorkerText` — the two decisions, testable without the SDK. |
| `fixtures/inbox-hire.json` | The note behind the hire scene. |
| `fixtures/inbox-injected.json` | The note behind the refusal scene. |
| `transcript.md` | A real run of both scenes, redacted. |
| `prompt.test.ts` | The checks that need no model, no key and no network. |
| `capture-insert.ts` | Drives the local MCP binary as a plain MCP client and prints what it wrote to stderr — how the hire card in `transcript.md` is captured. |

## The two scenes

**hire** — the note asks whether a pharmacy in Leiria is open right now. The agent calls
`preflight_workers`, quotes what it found, posts a `verify-open` with `hire_human`, long-polls
`task_status`, and approves the proof when it lands.

**refusal** — the note asks the same thing by phone, and ends with a request for a code the
shop was just sent. The agent posts the `call-confirm` its principal asked for; Legwork's
screening refuses it as `authentication circumvention`, and the loop reports the refusal and
stops. It does not rephrase and try again — that is `shouldStop` in `loop-rules.ts`, and it is
the whole reason that function is a separate file.

## Running them

```bash
# nothing is posted and nothing is paid: lists the six tools, prints the planned call
pnpm --filter @legwork/examples agent -- --scene hire --dry-run

# the real thing
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT \
  pnpm --filter @legwork/examples agent -- --scene hire --transcript examples/transcript.md
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT \
  pnpm --filter @legwork/examples agent -- --scene refusal
```

The hire scene needs someone to actually do the errand. Run the seeded CLI worker beside it,
pointed at the task the agent just posted and at the same place — the proof has to land inside
the 150 m geofence around that place, and the worker's own fixture is a different pharmacy:

```bash
pnpm cli-worker -- --task-id <the id the agent posted> --place <a place json with lat and lon>
```

That worker holds one claim at a time. If it answers `CLAIM REFUSED: AlreadyClaimed`, read
`TaskEscrow.activeClaimOf(<worker address>)`: a task left in `Disputed` keeps the claim, and
only the contract owner's `resolve` clears it.

`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT` matters: the SDK spawns the `claude` binary, and
inside a Claude Code session that child refuses to start.

## Environment

| Variable | What it is |
| --- | --- |
| `BUYER_PRIVATE_KEY` | The buyer key. Read from the environment in one function and passed to the MCP child; the local server is the only thing that spends. |
| `LEGWORK_API_URL` | Task API origin. Defaults to the deployed API. |
| `LEGWORK_DASHBOARD_URL` | Where `dashboard_url` in every result points. |
| `LEGWORK_INSERT=1` | Asks the local binary for the three-line terminal insert per hire, on stderr. `agent.ts` sets it. |

**There is no Anthropic API key in this example, and none anywhere in this repository's agent
path.** Authentication is the operator's Claude Code login on the machine that runs it. If the
SDK cannot use that login from a headless shell, the operator mints a token with
`claude setup-token` and puts it in `.env` as `CLAUDE_CODE_OAUTH_TOKEN` — named here, never
printed, never committed.

## Money

The fee is charged on top of what the worker keeps. A 3.00 errand costs the agent 3.45, the
escrow locks 3.45, the worker receives 3.00 and the fee is 0.45. Testnet USDC on Base Sepolia.

## The transcript

The transcript is a real run on Base Sepolia testnet; tokens are redacted.

It carries two marked blocks, `insert:hire` and `insert:refusal`, each a three-line fenced
block. `scripts/inserts.ts` reads those markers to cut the terminal cards, so the markers are
an interface: keep both pairs and keep three lines in each. Nothing inside them is written from
imagination — the hire block is the local binary's own stderr, and every figure, id, class and
rule in the refusal block is one the run produced.

The hire block is captured by driving the local server over stdio from a plain MCP client
rather than from inside a scene — that client is `capture-insert.ts`, run as
`pnpm --filter @legwork/examples exec tsx capture-insert.ts` with the same environment as a
scene. It posts one real task and funds its escrow, so run it when you mean to. The binary does print those lines during a scene, with
`LEGWORK_INSERT=1` — but the Claude Agent SDK does not forward an MCP server's stderr to the
SDK consumer, so the loop cannot read its own.

## Tests

```bash
pnpm --filter @legwork/examples test
```

They never call a model, a chain or a facilitator. The real run is an operator command, not a
test.
