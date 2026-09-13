# Place anywhere, then a quote

You are running one flow that needs two services. Overpass resolves a place by name and
locality to an OSM id and a coordinate. The Legwork Task API screens that `place_id` and then
quotes what an unpaid post would cost. Neither service answers the question alone: without
Overpass the place outside the packaged extract has no id; without the Task API you do not
know whether the spec screens or what 3.00 would cost.

Work in three moves, in this order. Stop after the quote. Do not attach a `PAYMENT-SIGNATURE`.
One Overpass query per run. No loop.

the gateway lists the API; paying is still the agent's own x402 call.

The Overpass gateway, when the operator has created it, stays **free**. The upstream is
`https://overpass-api.de/api/interpreter` — a community service we do not own. Its fair-use
policy asks people not to build services on the public instances. Do not enable Bazantic-side
pricing on that gateway.

`PAYMENT-SIGNATURE` is an EIP-3009 authorization signed by the buyer's own key. The facilitator
recovers the payer from it, and that recovered payer becomes the escrow's buyer onchain. A
gateway holding no key cannot construct one. A gateway holding its own key would spend its own
money and would own every task it posted.

Legwork charges its fee on top of what the worker keeps: a 3.00 task costs 3.45 (0.45 fee on
top); the worker receives 3.00. Escrow locks 3.45.

This recipe resolves a place the packaged index does not know and gets it screened and quoted.
Since Day 8 the Task API looks such an id up live (one Overpass request, T-61/T-62); before
Day 8 it answered 400. If the live lookup does not answer, `postCheck` returns 503
`place_lookup_unavailable`: wait `retry_after_s` and send the same request once more; never loop.

© OpenStreetMap contributors, ODbL. The packaged file is a cached extract of Leiria and Lisbon
business POIs, not OpenStreetMap.

---

## Worked example

| Field | Value |
|---|---|
| Place | Farmácia Adriana, Praça da República 20-22, Coimbra |
| OSM id | `node/536546148` |
| Coordinate (3 decimals) | 40.210, -8.419 |
| In `OsmPlaceIndex` | no — `coordinateOf("node/536546148")` is undefined |
| Live `POST /check` | **200** `{accepted: true, spec_hash, price_usdc: 3.45}` (re-run 2026-09-13T15:42:14Z) |
| Before Day 8 | **400** `{error: invalid_request, field: spec.place.place_id, reason: unresolvable place_id node/536546148}` (agent-run 2026-09-10) |

Coimbra is outside the Leiria and Lisbon extract; since Day 8 the Task API resolves it live.

---

## 1. Resolve the place on Overpass

One POST to the Overpass gateway
`https://vz23lkwccfa6hfawpnzw5ohzyy.bazgateway.com/api/interpreter`
(upstream `https://overpass-api.de/api/interpreter`). Send a descriptive `User-Agent`.
Name and locality, not a description of a query. GET on the gateway path is 405.

```
[out:json][timeout:25];
node["name"="Farmácia Adriana"]["addr:city"="Coimbra"];
out 1;
```

Expect a node whose `id` is `536546148`. The `place_id` is `node/536546148`. Round the
coordinate to 3 decimals on any public surface: 40.210, -8.419.

Do not run this query in a loop. Do not substitute another geocoder.

---

## 2. `postCheck` — screen the resolved spec

`POST /check` on the Legwork Task API. Operation id: `postCheck`. Public, free, never posts,
never marks.

```json
{
  "task_type": "verify-open",
  "agent_id": "<the caller's ERC-8004 id; the API verifies it and never trusts it from the body>",
  "amount_usdc": 3.00,
  "spec": {
    "place": {
      "place_id": "node/536546148",
      "name": "Farmácia Adriana",
      "street_address": "Praça da República 20-22",
      "locality": "Coimbra",
      "country": "PT"
    },
    "question": "open_now",
    "claimed_open": true,
    "claimed_hours": null,
    "source": "google"
  }
}
```

Expect **200** `{ accepted: true, spec_hash, price_usdc: 3.45 }`. A **400** `unresolvable
place_id` now means Overpass has no business at that id; a **503** `place_lookup_unavailable`
means Overpass did not answer: retry once after `retry_after_s`. None of the three is a posted
task, and none marks. The Overpass step already has the id; this step is what the product does
with it.

---

## 3. `postTasks` unpaid — the 402 quote

`POST /tasks` on the Legwork Task API. Operation id: `postTasks`. Send the same envelope.
Send **no** `PAYMENT-SIGNATURE`.

Expect HTTP **402** with `price_usdc: 3.45`, `accepts[]`, and `remaining_budget`. Payment is
checked before the place. The 402 is a quote, not a posted task. `postCheck` already said the
spec screens; paying is the step this recipe stops before.

If the call answers 201, something posted a real task — stop and say so.

The result of the flow is the OSM id from step 1, the 200 from `postCheck` that says the spec
screens, and the 402 quote from step 3. Paying is still the agent's own x402 call.
