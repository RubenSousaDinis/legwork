# External posters — Legwork — real-world verification for AI agents

| date | who (handle / ERC-8004 id / payer) | channel | task type | self-funded? | would pay real money? | notes |
| --- | --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — | — |

## Counting rule

Only a builder who funded their own x402 payment counts toward the in-window demand test (≥3 external builders, Sept 4–13). Sponsored trials (test USDC from us) are logged with `self-funded? = no` and never counted.

Distinct external = distinct ERC-8004 agent id or payer address not on the operator allowlist. The subgraph carries the same count; the live feed shows it.

## Count

**self-funded external posters: 0 · sponsored trials: 0**

Cross-checked against the subgraph on 2026-09-10:
`PosterStats { distinctExternalBuyers: 0, externalTasks: 0 }` — the same zero, from the index
rather than from this file. Every task posted during the window was paid for by the operator's own
demo agent, which sits on the escrow allowlist and is excluded from the count by design.

The table above carries no rows because none were offered: no external builder posted a
self-funded task, and no sponsored trial was run either. Zero is the honest answer and it is
reported as zero rather than left blank.

_Finalized by T-49 on 2026-09-10._
