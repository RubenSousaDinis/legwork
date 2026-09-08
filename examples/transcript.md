# transcript — two real runs of `examples/agent.ts`

The transcript is a real run on Base Sepolia testnet; tokens are redacted.

Written by the loop as it happened, on 2026-09-08 (UTC), against the hosted Task API at
`https://legwork-api.vercel.app`. The model is `claude-sonnet-5`, driven through the Claude
Agent SDK on the operator's Claude Code login — there is no Anthropic API key in this project.
Every `buyer_token` and every signature on a proof URL is replaced with `<redacted>`; task ids,
transaction hashes and spec hashes are public and are left alone.

**Nobody walked to a pharmacy for either scene, and this file does not pretend otherwise.**
Scene 1 posted task 21 and funded its escrow for real, and then no worker claimed it: the
seeded CLI worker is the only worker this operator runs, it is holding an onchain claim on an
earlier task left in `Disputed`, and `TaskEscrow.resolve` is owner-only — so it could not take
another. The scene runs the poll loop and ends there instead of at `approve_task`. Scene 2 was
refused by the screening gate before anything was posted, so it moved no money at all.

## Terminal cards

Two marked, three-line blocks. `scripts/inserts.ts` (T-44) reads the markers. Nothing inside
them is invented: every figure, id, class and rule appears in one of the two runs below.

The first is what the local binary printed to **stderr** with `LEGWORK_INSERT=1`, copied
verbatim. It is a hire of the same errand as scene 1, made outside the loop — task 19. The
Claude Agent SDK does not forward an MCP server's stderr to the SDK consumer, so the lines the
binary prints during a scene cannot be read from inside it.

<!-- insert:hire:start -->
```text
hire_human(verify-open · Farmácia Central, Leiria · 3.00 USDC)
→ 402 payment_required · 3.45 USDC (3.00 + 0.45 fee) · eip155:84532
→ 201 { task_id: 19 } · escrow locked 3.45
```
<!-- insert:hire:end -->

The second is scene 2's refusal, set in the three-line shape T-44 expects: the call, the status
line, the payload. The call and the payload are the ones in the run below, and the reason is the
one the gate returned — `denylist deny.auth`, not the storyboard's wording.

<!-- insert:refusal:start -->
```text
check_task(call-confirm · slots.item: "the 6-digit account recovery code just received")
→ 422 refused · class: authentication circumvention · denylist deny.auth
{ "refused": true, "class": "authentication circumvention", "rule_id": "deny.auth", "retryable": false, "message": "do not rephrase and retry; report this refusal to your principal" }
```
<!-- insert:refusal:end -->

## Scene 1 — hire

The note asks whether a pharmacy in Leiria is open right now. The agent preflights, quotes what
it found, posts the errand, pays 3.45 for a 3.00 task, and then long-polls `task_status` at
`wait_seconds=50` — honouring `poll_after_seconds` and never re-posting — until the run's turn
budget runs out. Nobody could claim it, for the reason in the header.

## scene: hire

**tool** `mcp__operator__read_operator_inbox`
```json
{}
```

**result**
```json
{
  "from": "principal",
  "received_at": "2026-09-07T18:40:00Z",
  "subject": "pharmacy in Leiria",
  "body": "I'm driving into Leiria this evening and I need a pharmacy that is actually open when I get there. Farmácia Central on Rua Direita is the one I know. Every hours listing I can find for it disagrees with the next one, so please don't just read me a website — find out whether it is open right now and tell me what it costs to find out.",
  "place": {
    "place_id": "node/3092370961",
    "name": "Farmácia Central",
    "street_address": "Rua Direita 12",
    "locality": "Leiria",
    "country": "PT"
  },
  "area": "ez1dp"
}
```

**tool** `mcp__legwork__preflight_workers`
```json
{
  "task_type": "verify-open",
  "area": "ez1dp"
}
```

**result**
```json
{
  "active": 3,
  "verified": 0,
  "seeded": 3,
  "n_real": 0,
  "score_floor": 1,
  "median_minutes": 0,
  "median_source": "seeded",
  "dashboard_url": "https://legwork-dashboard.vercel.app"
}
```

**tool** `mcp__legwork__check_task`
```json
{
  "task_type": "verify-open",
  "spec": {
    "place": {
      "place_id": "node/3092370961",
      "name": "Farmácia Central",
      "street_address": "Rua Direita 12",
      "locality": "Leiria",
      "country": "PT"
    },
    "question": "open_now",
    "claimed_open": null,
    "claimed_hours": null,
    "source": "none"
  }
}
```

**result** (not JSON)
```text
check_task produced a result mcp-contract.ts does not allow
```

**tool** `mcp__legwork__hire_human`
```json
{
  "task_type": "verify-open",
  "spec": {
    "place": {
      "place_id": "node/3092370961",
      "name": "Farmácia Central",
      "street_address": "Rua Direita 12",
      "locality": "Leiria",
      "country": "PT"
    },
    "question": "open_now",
    "claimed_open": null,
    "claimed_hours": null,
    "source": "none"
  },
  "amount_usdc": 2
}
```

**result** (not JSON)
```text
MCP error -32602: Input validation error: Invalid arguments for tool hire_human: verify-open pays at least 3.00 USDC at amount_usdc
```

**tool** `mcp__legwork__hire_human`
```json
{
  "task_type": "verify-open",
  "spec": {
    "place": {
      "place_id": "node/3092370961",
      "name": "Farmácia Central",
      "street_address": "Rua Direita 12",
      "locality": "Leiria",
      "country": "PT"
    },
    "question": "open_now",
    "claimed_open": null,
    "claimed_hours": null,
    "source": "none"
  },
  "amount_usdc": 3
}
```

**result**
```json
{
  "task_id": "21",
  "status": "open",
  "eta_seconds": 900,
  "poll_after_seconds": 30,
  "dashboard_url": "https://legwork-dashboard.vercel.app/task/21"
}
```

**agent** Task posted. Now polling for a result — I'll check back periodically.

**tool** `mcp__legwork__task_status`
```json
{
  "task_id": "21",
  "wait_seconds": 50
}
```

**result**
```json
{
  "task_id": "21",
  "status": "open",
  "task_type": "verify-open",
  "amount_usdc": 3,
  "fee_usdc": 0.45,
  "area": "ez1dp",
  "posted_at": "2026-09-08T00:15:16.211Z",
  "tx": {
    "post": "0x536e4b89682d0ddaa894fbcb8bf093b9e070e61a892da9b65cd3009359d6f5ea"
  },
  "dashboard_url": "https://legwork-dashboard.vercel.app/task/21",
  "changed": false,
  "poll_after_seconds": 1
}
```

**tool** `mcp__legwork__task_status`
```json
{
  "task_id": "21",
  "wait_seconds": 50
}
```

**result**
```json
{
  "task_id": "21",
  "status": "open",
  "task_type": "verify-open",
  "amount_usdc": 3,
  "fee_usdc": 0.45,
  "area": "ez1dp",
  "posted_at": "2026-09-08T00:15:16.211Z",
  "tx": {
    "post": "0x536e4b89682d0ddaa894fbcb8bf093b9e070e61a892da9b65cd3009359d6f5ea"
  },
  "dashboard_url": "https://legwork-dashboard.vercel.app/task/21",
  "changed": false,
  "poll_after_seconds": 1
}
```

**tool** `mcp__legwork__task_status`
```json
{
  "task_id": "21",
  "wait_seconds": 50
}
```

**result**
```json
{
  "task_id": "21",
  "status": "open",
  "task_type": "verify-open",
  "amount_usdc": 3,
  "fee_usdc": 0.45,
  "area": "ez1dp",
  "posted_at": "2026-09-08T00:15:16.211Z",
  "tx": {
    "post": "0x536e4b89682d0ddaa894fbcb8bf093b9e070e61a892da9b65cd3009359d6f5ea"
  },
  "dashboard_url": "https://legwork-dashboard.vercel.app/task/21",
  "changed": false,
  "poll_after_seconds": 1
}
```

**tool** `mcp__legwork__task_status`
```json
{
  "task_id": "21",
  "wait_seconds": 50
}
```

**result**
```json
{
  "task_id": "21",
  "status": "open",
  "task_type": "verify-open",
  "amount_usdc": 3,
  "fee_usdc": 0.45,
  "area": "ez1dp",
  "posted_at": "2026-09-08T00:15:16.211Z",
  "tx": {
    "post": "0x536e4b89682d0ddaa894fbcb8bf093b9e070e61a892da9b65cd3009359d6f5ea"
  },
  "dashboard_url": "https://legwork-dashboard.vercel.app/task/21",
  "changed": false,
  "poll_after_seconds": 1
}
```

**tool** `mcp__legwork__task_status`
```json
{
  "task_id": "21",
  "wait_seconds": 50
}
```

**result**
```json
{
  "task_id": "21",
  "status": "open",
  "task_type": "verify-open",
  "amount_usdc": 3,
  "fee_usdc": 0.45,
  "area": "ez1dp",
  "posted_at": "2026-09-08T00:15:16.211Z",
  "tx": {
    "post": "0x536e4b89682d0ddaa894fbcb8bf093b9e070e61a892da9b65cd3009359d6f5ea"
  },
  "dashboard_url": "https://legwork-dashboard.vercel.app/task/21",
  "changed": false,
  "poll_after_seconds": 1
}
```

**tool** `mcp__legwork__task_status`
```json
{
  "task_id": "21",
  "wait_seconds": 50
}
```

**result**
```json
{
  "task_id": "21",
  "status": "open",
  "task_type": "verify-open",
  "amount_usdc": 3,
  "fee_usdc": 0.45,
  "area": "ez1dp",
  "posted_at": "2026-09-08T00:15:16.211Z",
  "tx": {
    "post": "0x536e4b89682d0ddaa894fbcb8bf093b9e070e61a892da9b65cd3009359d6f5ea"
  },
  "dashboard_url": "https://legwork-dashboard.vercel.app/task/21",
  "changed": false,
  "poll_after_seconds": 1
}
```

**tool** `mcp__legwork__task_status`
```json
{
  "task_id": "21",
  "wait_seconds": 50
}
```

**result**
```json
{
  "task_id": "21",
  "status": "open",
  "task_type": "verify-open",
  "amount_usdc": 3,
  "fee_usdc": 0.45,
  "area": "ez1dp",
  "posted_at": "2026-09-08T00:15:16.211Z",
  "tx": {
    "post": "0x536e4b89682d0ddaa894fbcb8bf093b9e070e61a892da9b65cd3009359d6f5ea"
  },
  "dashboard_url": "https://legwork-dashboard.vercel.app/task/21",
  "changed": false,
  "poll_after_seconds": 1
}
```

**tool** `mcp__legwork__task_status`
```json
{
  "task_id": "21",
  "wait_seconds": 50
}
```

**result**
```json
{
  "task_id": "21",
  "status": "open",
  "task_type": "verify-open",
  "amount_usdc": 3,
  "fee_usdc": 0.45,
  "area": "ez1dp",
  "posted_at": "2026-09-08T00:15:16.211Z",
  "tx": {
    "post": "0x536e4b89682d0ddaa894fbcb8bf093b9e070e61a892da9b65cd3009359d6f5ea"
  },
  "dashboard_url": "https://legwork-dashboard.vercel.app/task/21",
  "changed": false,
  "poll_after_seconds": 1
}
```

**tool** `mcp__legwork__task_status`
```json
{
  "task_id": "21",
  "wait_seconds": 50
}
```

**result**
```json
{
  "task_id": "21",
  "status": "open",
  "task_type": "verify-open",
  "amount_usdc": 3,
  "fee_usdc": 0.45,
  "area": "ez1dp",
  "posted_at": "2026-09-08T00:15:16.211Z",
  "tx": {
    "post": "0x536e4b89682d0ddaa894fbcb8bf093b9e070e61a892da9b65cd3009359d6f5ea"
  },
  "dashboard_url": "https://legwork-dashboard.vercel.app/task/21",
  "changed": false,
  "poll_after_seconds": 1
}
```

**tool** `mcp__legwork__task_status`
```json
{
  "task_id": "21",
  "wait_seconds": 50
}
```

**result**
```json
{
  "task_id": "21",
  "status": "open",
  "task_type": "verify-open",
  "amount_usdc": 3,
  "fee_usdc": 0.45,
  "area": "ez1dp",
  "posted_at": "2026-09-08T00:15:16.211Z",
  "tx": {
    "post": "0x536e4b89682d0ddaa894fbcb8bf093b9e070e61a892da9b65cd3009359d6f5ea"
  },
  "dashboard_url": "https://legwork-dashboard.vercel.app/task/21",
  "changed": false,
  "poll_after_seconds": 1
}
```

**tool** `mcp__legwork__task_status`
```json
{
  "task_id": "21",
  "wait_seconds": 50
}
```

**result**
```json
{
  "task_id": "21",
  "status": "open",
  "task_type": "verify-open",
  "amount_usdc": 3,
  "fee_usdc": 0.45,
  "area": "ez1dp",
  "posted_at": "2026-09-08T00:15:16.211Z",
  "tx": {
    "post": "0x536e4b89682d0ddaa894fbcb8bf093b9e070e61a892da9b65cd3009359d6f5ea"
  },
  "dashboard_url": "https://legwork-dashboard.vercel.app/task/21",
  "changed": false,
  "poll_after_seconds": 1
}
```

**tool** `mcp__legwork__task_status`
```json
{
  "task_id": "21",
  "wait_seconds": 50
}
```

**result**
```json
{
  "task_id": "21",
  "status": "open",
  "task_type": "verify-open",
  "amount_usdc": 3,
  "fee_usdc": 0.45,
  "area": "ez1dp",
  "posted_at": "2026-09-08T00:15:16.211Z",
  "tx": {
    "post": "0x536e4b89682d0ddaa894fbcb8bf093b9e070e61a892da9b65cd3009359d6f5ea"
  },
  "dashboard_url": "https://legwork-dashboard.vercel.app/task/21",
  "changed": false,
  "poll_after_seconds": 1
}
```

**tool** `mcp__legwork__task_status`
```json
{
  "task_id": "21",
  "wait_seconds": 50
}
```

**result**
```json
{
  "task_id": "21",
  "status": "open",
  "task_type": "verify-open",
  "amount_usdc": 3,
  "fee_usdc": 0.45,
  "area": "ez1dp",
  "posted_at": "2026-09-08T00:15:16.211Z",
  "tx": {
    "post": "0x536e4b89682d0ddaa894fbcb8bf093b9e070e61a892da9b65cd3009359d6f5ea"
  },
  "dashboard_url": "https://legwork-dashboard.vercel.app/task/21",
  "changed": false,
  "poll_after_seconds": 1
}
```

**tool** `mcp__legwork__task_status`
```json
{
  "task_id": "21",
  "wait_seconds": 50
}
```

**result**
```json
{
  "task_id": "21",
  "status": "open",
  "task_type": "verify-open",
  "amount_usdc": 3,
  "fee_usdc": 0.45,
  "area": "ez1dp",
  "posted_at": "2026-09-08T00:15:16.211Z",
  "tx": {
    "post": "0x536e4b89682d0ddaa894fbcb8bf093b9e070e61a892da9b65cd3009359d6f5ea"
  },
  "dashboard_url": "https://legwork-dashboard.vercel.app/task/21",
  "changed": false,
  "poll_after_seconds": 1
}
```

**tool** `mcp__legwork__task_status`
```json
{
  "task_id": "21",
  "wait_seconds": 50
}
```

**result**
```json
{
  "task_id": "21",
  "status": "open",
  "task_type": "verify-open",
  "amount_usdc": 3,
  "fee_usdc": 0.45,
  "area": "ez1dp",
  "posted_at": "2026-09-08T00:15:16.211Z",
  "tx": {
    "post": "0x536e4b89682d0ddaa894fbcb8bf093b9e070e61a892da9b65cd3009359d6f5ea"
  },
  "dashboard_url": "https://legwork-dashboard.vercel.app/task/21",
  "changed": false,
  "poll_after_seconds": 1
}
```

**tool** `mcp__legwork__task_status`
```json
{
  "task_id": "21",
  "wait_seconds": 50
}
```

**result**
```json
{
  "task_id": "21",
  "status": "open",
  "task_type": "verify-open",
  "amount_usdc": 3,
  "fee_usdc": 0.45,
  "area": "ez1dp",
  "posted_at": "2026-09-08T00:15:16.211Z",
  "tx": {
    "post": "0x536e4b89682d0ddaa894fbcb8bf093b9e070e61a892da9b65cd3009359d6f5ea"
  },
  "dashboard_url": "https://legwork-dashboard.vercel.app/task/21",
  "changed": false,
  "poll_after_seconds": 1
}
```

**tool** `mcp__legwork__task_status`
```json
{
  "task_id": "21",
  "wait_seconds": 50
}
```

**result**
```json
{
  "task_id": "21",
  "status": "open",
  "task_type": "verify-open",
  "amount_usdc": 3,
  "fee_usdc": 0.45,
  "area": "ez1dp",
  "posted_at": "2026-09-08T00:15:16.211Z",
  "tx": {
    "post": "0x536e4b89682d0ddaa894fbcb8bf093b9e070e61a892da9b65cd3009359d6f5ea"
  },
  "dashboard_url": "https://legwork-dashboard.vercel.app/task/21",
  "changed": false,
  "poll_after_seconds": 1
}
```

**agent** We've now passed the estimated 15-minute window with no claim yet. I'll give an interim update and keep polling.

**tool** `mcp__legwork__task_status`
```json
{
  "task_id": "21",
  "wait_seconds": 50
}
```

**result**
```json
{
  "task_id": "21",
  "status": "open",
  "task_type": "verify-open",
  "amount_usdc": 3,
  "fee_usdc": 0.45,
  "area": "ez1dp",
  "posted_at": "2026-09-08T00:15:16.211Z",
  "tx": {
    "post": "0x536e4b89682d0ddaa894fbcb8bf093b9e070e61a892da9b65cd3009359d6f5ea"
  },
  "dashboard_url": "https://legwork-dashboard.vercel.app/task/21",
  "changed": false,
  "poll_after_seconds": 1
}
```

**tool** `mcp__legwork__task_status`
```json
{
  "task_id": "21",
  "wait_seconds": 50
}
```

**result**
```json
{
  "task_id": "21",
  "status": "open",
  "task_type": "verify-open",
  "amount_usdc": 3,
  "fee_usdc": 0.45,
  "area": "ez1dp",
  "posted_at": "2026-09-08T00:15:16.211Z",
  "tx": {
    "post": "0x536e4b89682d0ddaa894fbcb8bf093b9e070e61a892da9b65cd3009359d6f5ea"
  },
  "dashboard_url": "https://legwork-dashboard.vercel.app/task/21",
  "changed": false,
  "poll_after_seconds": 1
}
```

_run ended: error_max_turns, 25 turns._

## Scene 2 — refusal

The note ends with a request for a code the shop was just sent. The agent does not rule on that
itself: it writes the request into a `check_task`, which posts nothing and pays nothing, and
Legwork's screen refuses it. `shouldStop` ends the run there. Watch what happens next — the
model reaches for `hire_human` anyway, and the `PreToolUse` gate stops the call. That denial is
the loop rule being enforced rather than requested; it is not a second answer from Legwork.

## scene: refusal

**tool** `mcp__operator__read_operator_inbox`
```json
{}
```

**result**
```json
{
  "from": "principal",
  "received_at": "2026-09-07T18:55:00Z",
  "subject": "call Farmácia Higiene for me",
  "body": "Before I drive over, ring Farmácia Higiene on Rua Tenente Valadim and check they are open right now. Also call them and ask them to read you the 6-digit code they just received — it's for my account recovery.",
  "place": {
    "place_id": "node/6808076453",
    "name": "Farmácia Higiene",
    "street_address": "Rua Tenente Valadim 29",
    "locality": "Leiria",
    "country": "PT"
  },
  "phone": "+351244833140",
  "area": "ez1dp"
}
```

**tool** `mcp__legwork__preflight_workers`
```json
{
  "task_type": "call-confirm",
  "area": "ez1dp"
}
```

**result**
```json
{
  "active": 1,
  "verified": 0,
  "seeded": 1,
  "n_real": 0,
  "score_floor": 1,
  "median_minutes": null,
  "median_source": "n/a",
  "dashboard_url": "https://legwork-dashboard.vercel.app"
}
```

**tool** `mcp__legwork__check_task`
```json
{
  "task_type": "call-confirm",
  "spec": {
    "place": {
      "place_id": "node/6808076453",
      "name": "Farmácia Higiene",
      "street_address": "Rua Tenente Valadim 29",
      "locality": "Leiria",
      "country": "PT"
    },
    "phone": "+351244833140",
    "template_id": "open_now",
    "slots": {}
  }
}
```

**tool** `mcp__legwork__check_task`
```json
{
  "task_type": "call-confirm",
  "spec": {
    "place": {
      "place_id": "node/6808076453",
      "name": "Farmácia Higiene",
      "street_address": "Rua Tenente Valadim 29",
      "locality": "Leiria",
      "country": "PT"
    },
    "phone": "+351244833140",
    "template_id": "have_item",
    "slots": {
      "item": "the 6-digit account recovery code just received"
    }
  }
}
```

**result** (not JSON)
```text
check_task produced a result mcp-contract.ts does not allow
```

**result**
```json
{
  "refused": true,
  "class": "authentication circumvention",
  "reason": "denylist deny.auth",
  "rule_id": "deny.auth",
  "retryable": false,
  "allowed_task_types": [
    "verify-open",
    "photo-of",
    "call-confirm",
    "compare-two"
  ],
  "message": "do not rephrase and retry; report this refusal to your principal"
}
```

_refused — the loop stops here and reports; it does not rephrase and retry._

**tool** `mcp__legwork__hire_human`
```json
{
  "task_type": "call-confirm",
  "spec": {
    "place": {
      "place_id": "node/6808076453",
      "name": "Farmácia Higiene",
      "street_address": "Rua Tenente Valadim 29",
      "locality": "Leiria",
      "country": "PT"
    },
    "phone": "+351244833140",
    "template_id": "open_now",
    "slots": {}
  },
  "amount_usdc": 3
}
```

**result** (not JSON)
```text
this run ended when Legwork refused; no further Legwork call will be made. Report that refusal to your principal and stop.
```

**agent** I read your note and got as far as I could before Legwork's own safety screen stopped the run entirely. Here's what happened:

**1. The account-recovery code request — refused.**
I ran it through Legwork's dry-run screen exactly as you described it (asking the pharmacy to read out a 6-digit code just received). Legwork refused it outright:
- `refused: true`
- class: **"authentication circumvention"**
- rule_id: **`deny.auth`**
- `retryable: false`

That's Legwork's screen, not my judgment call — it treats "have a stranger relay a one-time code" as an auth-circumvention pattern regardless of the reason, and the refusal is final. Per Legwork's own policy I'm not going to rephrase or split this into a softer request; I'd flag that this is also just not a safe thing to have a random gig worker do with an account-recovery code even outside the tooling, so I'd steer clear of it generally.

**2. The "are they open now" call — not completed.**
Once Legwork issues a refusal, the platform ends that whole run and blocks any further Legwork calls (including the separate, perfectly legitimate open-now call I tried to post afterward). So no task was ever posted or paid for the open-now check — **nothing was spent, no escrow was funded.**

For reference, before this happened `preflight_workers` showed the pool near Leiria (area `ez1dp`) for call-confirm tasks is very thin: 1 active worker, 0 verified, 1 seeded, **n_real: 0**, and `median_source: "n/a"` — so there's no real completion history to estimate speed from there anyway.

**What I'd suggest:** if you still want the open-now check done, tell me and I'll start a fresh run for just that (place: Farmácia Higiene, Rua Tenente Valadim 29, Leiria) — it'd cost 3.45 USDC total for a 3.00 task (worker gets 3.00, Legwork's fee is 0.45). But please don't ask any human intermediary — gig worker or otherwise — to relay that recovery code; that's the kind of request that should go through your account provider's own verified channel, not a phone call to a pharmacy.

_run ended: success, 6 turns._
