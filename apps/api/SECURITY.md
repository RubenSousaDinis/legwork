# Task API — what is protected, and what is not

The Task API is public from day one. It takes money, it sets cookies and it holds an admin
key, so this file says plainly which guards exist, where each one stops, and which risks are
carried rather than closed. Everything described here lives in `src/middleware/` as one edge
middleware plus its helpers; every guard is a pure function, and each has a named test.

Testnet USDC only. Nothing this API moves is spendable money.

## The guards

### Rate limits

Sliding windows, one minute wide, applied per client address or per worker session. The
policy table is `RATE_LIMITS` in `src/middleware/rateLimit.ts`:

| Route | Limit per minute |
|---|---|
| `POST /check` | 30 per address |
| `POST /proofs` | 10 per session **and** 20 per address |
| `GET /session/nonce`, `POST /session` | 10 per address |
| `POST /idkit/*` | 10 per address |
| `POST /register` | 5 per address |
| `GET /tasks`, `GET /tasks/:id`, `GET /public/*` | 120 per address |
| `POST /tasks/:id/claim`, `/release-claim`, `/submit`, `/report` | 30 per session |

Over the limit is `429 {"error":"rate_limited","retry_after_s":N}` with a `Retry-After`
header.

The client address is the first hop of `x-forwarded-for`, then `x-real-ip`, then the single
bucket `unknown` — a caller the proxy cannot place still queues behind everyone else it
cannot place. The session subject is sha-256 of the worker-session cookie, first 16 hex
characters, never the cookie itself: a limiter key ends up in a metric, a log line and a
memory dump, and a session token in any of those is a session someone else can hold.

`POST /tasks` is deliberately absent from that table. It is limited by money, not by
requests — see **Caps** below.

### Body caps

Decided from `Content-Length` before a byte is read, because the edge runtime should not
buffer 8 MiB to discover it is 8 MiB.

| Route | Cap |
|---|---|
| `POST /proofs` | 8 MiB (`8388608`) |
| every other JSON route | 16 KiB (`16384`) |

Over the cap is `413 {"error":"payload_too_large","max_bytes":N}`. A JSON route that sends a
body without saying how long it is gets `411 {"error":"length_required"}`: an unmeasured body
is one this layer cannot cap at all, and accepting it would make the cap advisory. A POST
with no `Content-Type` and no `Transfer-Encoding` — `POST /tasks/:id/claim`,
`POST /admin/pause` — is a bodyless POST and passes. `readJsonWithCap(req, maxBytes)` is the
handler-side counterpart: it counts as it reads and gives up the moment the running total
passes the cap, before `JSON.parse` sees any of it.

### CORS

The allowlist is exactly `MINIAPP_URL` and `DASHBOARD_URL`, reduced to scheme, host and port.
An allowlisted `Origin` is echoed back with `Access-Control-Allow-Credentials: true` and
`Vary: Origin`; `OPTIONS` gets `204` with the methods, headers and a 600-second max age. Any
other `Origin`, including the literal `null` a sandboxed frame sends, gets
`403 {"error":"origin_not_allowed"}` and no CORS headers at all.

**A request with no `Origin` header passes through untouched.** Agents, the local MCP server
and curl send no `Origin`, and CORS was never a control over them — it is a control the
browser applies on a page's behalf. Refusing a request for lacking the header would break
every non-browser caller while stopping nothing. CORS here protects the two browser
frontends' users from a hostile page; it is not an authentication check, and nothing on this
API relies on it as one.

### Admin gate

`/admin/*` does not exist unless `ADMIN_API_KEY` is set and is at least 32 characters. Unset,
or shorter than that, every `/admin/*` request answers `404 {"error":"not_found"}` — including
one that presents a key. That is the point: an operator console answering `401` to an
anonymous caller has confirmed there is a console to attack, and there is exactly one state in
which these routes answer `401`, which is a key configured and the caller's wrong.

With a key set, `X-Admin-Key` is compared in constant time — both sides digested with Web
Crypto, the two fixed-width results XORed — so neither a wrong key nor a wrong length is
distinguishable by timing. A mismatch or a missing header is `401 {"error":"unauthorized"}`.
`/admin/*` never receives CORS headers in any state.

The key is read once, from `process.env`, in `readEnv`. It is never logged, never echoed in
an error body, and never reaches a client bundle.

### Log redaction

`createLogger` in `src/middleware/redact.ts` is pino with two mechanisms, and the order
matters.

The request serializer is an **allowlist**: `content-type`, `content-length`, `user-agent`,
`origin` and `x-request-id` survive, and every other header is dropped before pino sees it.
A credential in a header nobody has thought of yet is therefore gone without anybody having
had to think of it. Censoring would still print the header's name next to `[REDACTED]`;
dropping prints nothing.

`REDACT_PATHS` is the backstop for bodies, where the shape is ours and a denylist can be
complete: `authorization`, `cookie`, `x-buyer-token`, `x-admin-key`, `payment-signature`,
`x-buyer-signature`, `set-cookie`, and nested `buyer_token`, `privateKey`, `private_key`,
`secret`, `token`, `cookie`, censored to `[REDACTED]`.

`X-Buyer-Token` is covered twice — dropped by the allowlist and censored by the paths — and a
test asserts its value appears nowhere in the output.

## Caps: the limit that actually holds

Rate limits here are **best effort, per instance**. Vercel runs several instances and they
share nothing, so the effective ceiling is the number in the table multiplied by however many
instances are warm. There is no shared store in v0 — a Redis or Upstash backed
`RateLimitStore` is the obvious next step, and `RateLimitStore` is an interface precisely so
it can be swapped without touching a guard. **This is not DDoS protection and is not claimed
as any.** Absorbing a real flood is the platform's job, upstream of this code.

The limit that does hold is the one on money, and it is durable because it is a database row
and a contract, not a counter in an instance's memory: `caps_ledger`, with
`MAX_OPEN_TASKS_PER_BUYER = 5` and `DAILY_CAP_USDC = 25` (`packages/shared/src/constants.ts`).
A buyer cannot post past those regardless of how many instances answer, and `POST /tasks`
costs money on every attempt: the agent pays **3.45** for a task, escrow locks **3.45**, the
worker receives **3.00**, and the fee is **0.45** — 15 % on top, so the worker keeps the
posted rate. At the daily cap that is seven tasks and change before the ledger says no.

## What this file does not cover

- **Route behaviour, session cookies and the caps ledger** — the routes themselves
  (`app/**`, `src/services/**`).
- **x402 payment verification** — the payment path.
- **Proof storage beyond `Content-Length`** — image handling, EXIF stripping and the private
  bucket.
- **Admin route bodies and the `admin_audit` rows** — every admin call is audit-logged by the
  route, not by this middleware.

The middleware is a perimeter. It refuses obviously-too-much and obviously-not-allowed; it
does not authenticate anybody. Every route still checks its own auth.

## Disclosed operator powers

There is one operator, holding four keys with one job each, and the powers that come with
them are written down rather than implied: deploy and owner calls (`seedWorker`,
`resetWorker`, `resolve`, `pause`/`unpause`, `setAllowlistedBuyer`, `setMarkCooldown`,
`registerIdentity`), relaying worker actions, signing attestations, and signing abuse marks.
The full table — which key does what, and what each one never does — is
[`docs/keys.md`](../../docs/keys.md).

Dispute resolution today is a single signer. The contract does not know that, which is why it
is in a contract and in this paragraph.

## Worker-authored text

From the threat model ([`docs/threat-model.md`](../../docs/threat-model.md)):

> **FIX** Worker-authored text injected into the buyer's agent | Answer = enum + ≤120-char
> escaped note, wrapped as untrusted data in the tool result | MCP contract test

A worker types free text, and that text reaches an LLM the buyer is running. It is therefore
treated as data and never as instruction: the answer is an enum, the note is capped at 120
escaped characters, and the MCP tool result wraps both as untrusted input. The contract test
is what keeps that true.

## Reporting something

Contact the operator through the address in the [root README](../../README.md). No address is
typed here, so there is one place to keep current.

If it involves a key, a token or a session, please say so without pasting the value — this
API's logs are built not to hold one, and a report should not be the exception.
