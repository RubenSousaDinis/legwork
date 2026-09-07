# Legwork subgraph — Base Sepolia

Indexes the four Legwork contracts on Base Sepolia and serves the dashboard
(`apps/dashboard`) and the `preflight_workers` MCP tool (`packages/mcp`).
Schema and handlers are T-09's; this README covers the deployment.

## Deployed

| | |
|---|---|
| Slug | `legwork-base-sepolia` |
| Version label | `6653cb4` (the git short SHA of the manifest commit) |
| Deployment id | `QmQfhYXvMH7hTvtp3inckP2662USA9c5Nbd2gvFaKUiTcv` |
| Studio | https://thegraph.com/studio/subgraph/legwork-base-sepolia |
| Query URL | https://api.studio.thegraph.com/query/74763/legwork-base-sepolia/6653cb4 |
| Network | `base-sepolia` (chain id 84532) |
| `startBlock` | `46506271` — all four data sources |

Addresses come from `contracts/deployments/base-sepolia.json`; the manifest holds
no address that is not in that file.

A subgraph on a testnet stops at Studio — it cannot be published to the
decentralized network. The Studio query URL above is the endpoint every consumer
uses. See the `#Graph` entry in `docs/spikes/RESULTS.md`.

## Deploy

```bash
cd subgraph
pnpm graph codegen && pnpm graph build
graph auth "$GRAPH_DEPLOY_KEY"                       # interactive shell only
graph deploy legwork-base-sepolia -l "$(git rev-parse --short HEAD)"
```

`graph-cli` 0.98 dropped the `--studio` flag from both commands: `graph auth`
now takes the key as a positional argument and `graph deploy` takes the slug.
`graph auth` already points the CLI at `https://api.studio.thegraph.com/deploy/`.

Confirm the new version has caught up before pointing anything at it — compare
`_meta.block.number` from the query URL against the Base Sepolia chain head, and
check `_meta.hasIndexingErrors` is `false`:

```bash
curl -s -H 'content-type: application/json' \
  -d '{"query":"{ _meta { block { number } hasIndexingErrors } }"}' "$SUBGRAPH_QUERY_URL"
```

## What is safe to publish

The query URL is publishable — it goes in a README, a PR, a slide. `GRAPH_DEPLOY_KEY`
and `GRAPH_API_KEY` are not: the deploy key is typed into `graph auth` and lives only
in the operator's untracked `.env`, and the API key is set through Vercel's environment
UI. Neither value belongs in a file in this repo, a log, a query string or a screenshot.
`.env.example` carries the names with empty values and is the only env file in git.

## Redeploying after a contract redeploy

Bump the four `startBlock` values (and the four addresses) in `subgraph.yaml` to the
new `contracts/deployments/base-sepolia.json`, then `graph deploy` with a fresh version
label — never keep a stale `startBlock`, the events before it are invisible.
The previously deployed version keeps serving its query URL while the new one syncs,
so move `SUBGRAPH_QUERY_URL` over only once the new version has reached the chain head.
