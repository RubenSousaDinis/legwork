# Bazantic feedback — Legwork — real-world verification for AI agents (ETHOnline 2026)

Operator account username: **RubenSousaDinis**. Kept while agentifying Overpass
and chaining it with the Legwork Task API for the Agentify / Recipe tracks.
Published with the submission.

### Entry format

```
**YYYY-MM-DD HH:MM UTC · <moment> · <confusing|missing|broken|hard to test>** — what was tried · what happened (exact error string) · suggestion
```

No secrets. Gateway URLs and public OpenAPI only.

## (1) OpenAPI → MCP encoding for non-JSON APIs

**2026-09-11 14:20 UTC · Overpass gateway Recipe Test + Playground · broken** — registered a second gateway for the public Overpass interpreter (`POST /api/interpreter`, OpenAPI with `application/x-www-form-urlencoded` `data` and later `text/plain` / JSON-string `requestBody`), bound it into recipe `place-anywhere-then-quote` with Legwork `postCheck` / `postTasks`, and ran Bazantic **Test** and **Playground** with the Coimbra worked example · both paths forwarded a **JSON-encoded** body. Overpass answered **HTTP 400** with OSM3S parse errors, including: `Unknown type ""[out:json][timeout:25];node[\"name\"=\"Farmácia Adriana\"][\"addr:city\"=\"Coimbra\"];out 1;""` and `An empty query is not allowed`. The same gateway URL with ordinary `curl` and `Content-Type: application/x-www-form-urlencoded` + `data=<QL>` (and a descriptive `User-Agent`) returns **200** and `node/536546148`. Recipe Test also earlier hit **HTTP 406** from `overpass-api.de` when Bazantic's client used a library User-Agent (`Go-http-client` / `python-requests`); that is a separate upstream policy, not a missing query · docs consulted: https://bazantic.com/docs/deploy-a-gateway · https://bazantic.com/docs/cli · https://bazantic.com/docs/recipes · https://bazantic.com/docs/gateway-manifest (preview `extra_headers` only) · https://bazantic.com/docs/skill-mcp — none describe honouring OpenAPI `content` types for form-urlencoded or raw text, or a request-body transform · suggestion: when the imported OpenAPI declares `application/x-www-form-urlencoded` or `text/plain`, have MCP / Playground / Recipe Test encode that way instead of always posting JSON; document the limitation if JSON-only is intentional; allow a static upstream `User-Agent` (the proposed `upstream.extra_headers` in the gateway manifest) so community Overpass instances that reject library UAs are reachable without a third-party mirror · id `B1`

**2026-09-11 15:30 UTC · Agentify Overpass without a JSON bridge · hard to test** — considered a small JSON→form bridge so Playground would go green; rejected it for the prize story (judges would fairly read that as agentifying our wrapper, not Overpass) · the honest demo path is: Overpass **gateway LIVE** on Bazantic + recipe text + screen recording of a form/`data=` call **through** `*.bazgateway.com` plus Legwork unpaid **402** · suggestion: treat green Recipe Test as optional evidence when the upstream is not a JSON API; accept gateway + recording + username as the Agentify bar when encoding is the blocker · id `B2`

## (2) Docs and product discovery

**2026-09-11 16:24 UTC · looking for form-body or content-type controls · missing** — read the live user guide for another way to call Overpass through Bazantic without a bridge · [Deploy](https://bazantic.com/docs/deploy-a-gateway) covers OpenAPI → MCP and Playground (x402 handshake); [CLI](https://bazantic.com/docs/cli) covers `baz curl` and free `tools/list`; [Recipes](https://bazantic.com/docs/recipes) covers bindings and Test with operator credential; [Skill & MCP](https://bazantic.com/docs/skill-mcp) says MCP discovers and `baz curl` pays; [gateway manifest](https://bazantic.com/docs/gateway-manifest) `extra_headers` is **preview — not released** · nothing documents form-urlencoded upstreams, Playground body type, or OpenAPI `content` honouring · suggestion: one doc page “Non-JSON upstreams” with form/`text/plain` examples and what Playground will / will not send · id `B3`

## (3) What worked

- Legwork Task API gateway (`https://nf26bnkznrbc3cg5rbq2hmej5q.bazgateway.com`): `postCheck` **200**, unpaid `postTasks` **402** — JSON APIs through Bazantic work as designed; the intentional unpaid **402** is the quote and should not be scored as a failed Recipe when the recipe says to stop before `PAYMENT-SIGNATURE`.
- Overpass gateway slug `vz23lkwccfa6hfawpnzw5ohzyy`: reachable; curl through that host with form `data=` succeeds.
- Recipes published: `worker-pool-then-quote` (Graph + Legwork), `place-anywhere-then-quote` (Overpass + Legwork).
