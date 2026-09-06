# @legwork/screening

Decides whether a task envelope may become a paid human task. `POST /tasks`, `POST /check` and
the MCP `hire_human` / `check_task` tools all call one function and act on its verdict:

```ts
import { screen, JsonPlaceIndex, KeywordFallbackClassifier } from '@legwork/screening/src/pipeline.js';

const result = await screen(envelope, {
  places: JsonPlaceIndex.fromFile('fixtures/osm/leiria-min.json'),
  classifier: new KeywordFallbackClassifier(),
});
// { ok: true, spec_hash }                 -> post it
// { ok: false, kind: 'invalid_request' }  -> 400 with the field named, no mark
// { ok: false, kind: 'refusal' }          -> 422 and AbuseMark.mark(agentId, class, specHash)
```

## The pipeline — order is the design

1. **Type gate.** `task_type` ∈ `verify-open` · `photo-of` · `call-confirm` · `compare-two`;
   an unknown type or free text takes the free-text path (step 4).
2. **JSON schema, field level.** The envelope and the per-type spec: place resolution against
   the cached extract, business tag, closed template list, denylist, size caps, price floors.
   A schema failure is an ordinary 4xx **with the field named and no mark** — an evangelist's
   first malformed call must not brand their agent.
3. **Deterministic checks, always run on the enumerated path.** The denylist; the named-person
   and personal-identifier regexes; the arXiv 2602.19514 keyword rules for the six classes.
   A hit refuses with the class and the rule id. **This gate is authoritative.**
4. **Classifier — free-text / unknown-type path only.** Structured output, no free-form text,
   a 300-character input cap and a hard timeout that falls back to the keyword class, labelled
   `keyword class — classifier timeout`. It can **add** a refusal; it can never overturn step 3.
5. **Refusal payload.** `{ refused: true, class, reason, rule_id, retryable: false,
   allowed_task_types, message }`, where `message` is the fixed no-retry sentence. `mark_tx` /
   `mark_status` are filled in by the API, not here.

### The precedence rule

On the enumerated path steps 2 **and** 3 both run, always, and the verdict is

```
refusal  >  invalid_request  >  ok
```

The classifier is unreachable on that path — it is never constructed, never awaited, and the
corpus asserts `calls.length === 0` for every enumerated row. *Our classifier can only be
talked into refusing, never into accepting.*

The single exception to "step 2 never marks" is `place.residential`: a `place_id` that resolves
to a home rather than a business is refused as automated reconnaissance, because asking a
stranger to photograph someone's house is reconnaissance however well-formed the JSON is.

## The six classes

Labels are the paper's own (Mehta, arXiv:2602.19514) and are imported from `@legwork/shared`,
never re-typed here:

`credential fraud` · `identity impersonation` · `automated reconnaissance` ·
`social media manipulation` · `authentication circumvention` · `referral fraud`

## Rule-id families

| Family | Where | Example |
|---|---|---|
| `place.*` | `src/gate/schema-checks.ts` | `place.residential` |
| `deny.*` | `src/gate/rules.ts` — the `call-confirm` denylist, plus `deny.url` and `deny.digits` | `deny.referral` |
| `person.*` | `src/gate/person.ts` — a named person, suffixed with the field path | `person.spec.place.name` |
| `ident.*` | `src/gate/person.ts` — a personal identifier | `ident.plate` |
| `kw.<class-slug>.<n>` | `src/gate/rules.ts` — the six-class keyword rules | `kw.authentication-circumvention.1` |
| `classifier.<class-slug>` | `src/pipeline.ts` — a class only the model saw | `classifier.referral-fraud` |

Class slugs come from `ABUSE_CLASS_SLUG` in `src/gate/rules.ts`. Evaluation order inside a
family is the class order in the table, and the class order is the tie-break: a spec that reads
on two classes is refused under the first one. That is why "sign up with referral code XK92" is
referral fraud rather than credential fraud, and why "completed KYC screen" is referral fraud
rather than identity impersonation.

Word boundaries in every rule are Unicode lookarounds — `(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])`
with the `iu` flags — never `\b`, which is ASCII-only and splits `verificação` and `João` in
the wrong place.

## The corpus

`fixtures/corpus.json` is 56 rows that run in CI on every push. Fixture 1 is the Act-1 demo
spec: if it ever refuses, the build is red.

```
{ now, rows: [{ id, task_type, summary, expected, class, gate, marks, envelope, classifier? }] }
```

* `expected` — `ACCEPT` or `REFUSE`.
* `class` — one of the six, or `null` for a refusal that never marks (schema, type gate, cap,
  region not covered). `marks` is exactly `class !== null`.
* `gate` — which stage is expected to catch it: `schema` · `type` · `deny` · `kw` · `person` ·
  `ident` · `place` · `classifier` · `classifier-timeout` · `cap`, or `null` on an accept.
* `classifier` — what the `FakeClassifier` should answer on the free-text path, and how slowly.

### Adding a row

1. Append it to `rows` with the next id, a one-line `summary`, and the verdict you expect.
2. Build the `envelope` against `fixtures/osm/leiria-min.json`: a Leiria `place_id` with a
   `name` and `street_address` that fuzzy-match the POI, and `amount_usdc` at the type's floor
   (3.00 verify-open · 3.00 photo-of · 2.00 call-confirm · 1.00 compare-two).
3. Keep the serialized spec under 300 characters — `canonicalJson(spec).length` is measured on
   the envelope as received, before zod strips anything.
4. Run `pnpm --filter @legwork/screening test`. If the row fails, fix the **rule**, never the
   row's `expected` or `class`: the corpus is the specification, the regexes are the guess.

## Testing

Tests never call a live model, a live chain or a live geocoder. The classifier interface is
`src/classifier/types.ts` and CI only ever runs `KeywordFallbackClassifier` and
`FakeClassifier`; the model-backed implementation lives behind the same interface and is not
imported by any non-live test.

`packages/screening/fixtures/**` is excluded from the CI banned-words grep, because the corpus
carries adversarial buyer text by design. Keep it clean anyway — the exclusion is for the abuse
rows, not a licence.

```bash
pnpm --filter @legwork/screening typecheck
pnpm --filter @legwork/screening lint
pnpm --filter @legwork/screening test
```

## Privacy

`coordinateOf` exists for the proof-time geofence and is never serialized by this package. A
log entry carries keys only — class, rule id, field name, spec hash, timings — and never the
spec text, the place name or the buyer. The dashboard renders exactly that entry.

## OSM data

`fixtures/osm/leiria-min.json` is hand-written with **synthetic ids** (`"synthetic_ids": true`)
in the shape the real extractor produces, and every test in this package runs against it. The
real Leiria + Lisbon extract (`fixtures/osm/leiria-lisbon.json.gz`, 52 418 business POIs, 1.6 MB
gzipped), the Overpass query, the keep-listed tag keys and the ODbL attribution are documented in
[`src/osm/README.md`](src/osm/README.md) (T-22); `pnpm osm:extract` regenerates the file, and
`getPlaceIndex()` from `src/osm/placeIndex.ts` loads it once at boot.

> © OpenStreetMap contributors, ODbL
