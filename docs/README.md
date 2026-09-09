# Docs — Legwork

Place data © OpenStreetMap contributors, available under the Open Database License (ODbL): https://www.openstreetmap.org/copyright.

Index of every file under `docs/` that this pass owns or links (task briefs under `plan/` are the lead's; `submission.md` is T-48; `feedback-world/` screenshots are T-41; `media/` captures are T-46 / T-47 / T-49 — linked, never overwritten here).

| File | What it is |
|---|---|
| [threat-model.md](threat-model.md) | One named test per attack; FIX rows ship, DOC rows are disclosed |
| [spikes/RESULTS.md](spikes/RESULTS.md) | Day-1 spike outcomes, Graph, Preflight, Timing, locked architecture |
| [keys.md](keys.md) | Roles, public addresses, disclosed operator powers |
| [api.md](api.md) | HTTP routes rendered from `packages/shared/src/api-contract.ts` |
| [mcp.md](mcp.md) | The six MCP tools, two modes, hand-checked against `mcp-contract.ts` |
| [mcp-schema.md](mcp-schema.md) | JSON-Schema dump of the same six tools (`pnpm docs:gen`) |
| [feedback-world/README.md](feedback-world/README.md) | Screenshot naming for `FEEDBACK-WORLD.md` |
| [media/preflight-card.png](media/preflight-card.png) | Live preflight card still (T-46) |

The root [README](../README.md) also carries the ODbL line under **Data sources and licences**.
