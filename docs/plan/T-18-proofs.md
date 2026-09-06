---
id: T-18
title: POST /proofs — hash raw bytes, strip EXIF, private store, signed URLs, rounding
lane: B
day: 2
size: M
agent_class: C
must: true
depends_on: [T-08]
owned_paths:
  - apps/api/app/proofs/**
  - apps/api/app/public/proofs/**
  - apps/api/src/services/proofStore.ts
  - apps/api/src/services/exif.ts
  - apps/api/src/services/signedUrl.ts
  - apps/api/src/services/geo.ts
  - apps/api/app/proofs/proofs.test.ts
labels: [area:api, wave:2, size:M, agent:cloud]
branch: t-18/proofs
---

# T-18 — POST /proofs — hash raw bytes, strip EXIF, private store, signed URLs, rounding

## 1. Context
A proof photo is the worker's evidence and, untreated, a movement history for a real person keyed to a nullifier: EXIF carries a device id and a 5-metre GPS fix. `/proofs` is the same-origin upload the mini-app calls before `submit`: the server hashes the **raw** bytes (that hash is what `submitFor` anchors onchain), re-encodes the image so no metadata survives, stores it in a private bucket, and returns `{proofHash, url, captured_at}`. Only a signed, expiring URL ever reaches a buyer (minted by T-19 with a valid buyer token), only a coordinate rounded to ~100 m ever reaches a public surface, and `GET /public/proofs/:hash/verify` re-hashes the retained original so "hash matches onchain ✓" is a check, not decoration.

> **02-architecture.md — `/proofs`:** same-origin upload from the mini-app: the server computes `keccak256` of the raw bytes, strips EXIF (device id, 5-metre GPS), stores the file in a private bucket behind signed URLs issued to the buyer for the dispute window, keeps the exact coordinate in the private task record, and returns `{proofHash, url}` which the client passes into the relayed submit. Only the hash and a coordinate rounded to ~100 m ever reach the chain or the subgraph. Not IPFS: a public CID plus intact EXIF would be a movement history for a real person keyed to a nullifier. `task_status` and the proof card re-hash the served file and show "hash matches onchain ✓" — an anchor nobody checks is decoration.

> **02-architecture.md — security rows:** **FIX** Proof photos deanonymise the worker | Private store, EXIF stripped, signed URLs, rounded coordinate in every public record, `geohash5` in the subgraph | `/proofs` unit test · **DOC** GPS spoofing | "GPS is self-reported and spoofable; we anchor it, geofence it, and dispute outside the radius — we do not prove it." · **DOC** Worker's approximate location exposed to the poster | Rounded coordinate only; stated.

> **T-01 (frozen) rows:** `POST /proofs` | worker-session, multipart ≤ 8 MB | `file, lat?, lon?, accuracy_m?, gps_unavailable?, worker_confirmed_at_place?` → `{proofHash, url, captured_at}` · `GET /public/proofs/:hash/verify` | public | never raw spec text, never an exact coordinate, never a buyer token, never a requester identity. Constants: `GEOFENCE_M = 150`, `PUBLIC_COORD_DECIMALS = 3` (≈ 100 m). Table `proofs` (`hash` PK, `storage_key`, `captured_at`, `exact_lat/lon/accuracy`, `gps_unavailable`, `worker`, `task_id`, `place_id`).

## 2. Exact scope
- `POST /proofs` (`maxDuration = 60`, `runtime = 'nodejs'`): `requireWorkerSession`; `req.formData()`; fields per the frozen row. Rules: `file` required, `size ≤ 8 * 1024 * 1024` (else **413** `{error: 'payload_too_large', max_bytes}` — the contract's generic error; settled by the lead after #75), content type sniffed from magic bytes ∈ `image/jpeg | image/png | image/webp` (else 400, reason `unsupported_type`); the GPS invariant `gps === null ⇔ gps_unavailable === true` — `lat/lon` both present with `gps_unavailable` absent or `false`, **or** neither present with `gps_unavailable: true` **and** `worker_confirmed_at_place: true`; anything else 400 (field `gps`). `lat ∈ [-90, 90]`, `lon ∈ [-180, 180]`, `accuracy_m ≥ 0`.
- Hash: `proofHash = keccak256(rawBytes)` (viem) computed on the bytes exactly as uploaded, before any decoding.
- `exif.ts`: `stripImage(raw: Buffer) → {bytes: Buffer, width, height}` = `sharp(raw).rotate().jpeg({quality: 85, mozjpeg: true}).toBuffer()` — `rotate()` with no argument applies the EXIF orientation, and sharp drops all metadata unless `.withMetadata()` is called (it is not). Output is always JPEG. `assertNoMetadata(bytes)` → `sharp(bytes).metadata()` has no `exif`, `icc`, `iptc`, `xmp`, `orientation`.
- `proofStore.ts`: `interface ProofStore { put(key, bytes, contentType): Promise<void>; get(key): Promise<Buffer | null>; exists(key): Promise<boolean> }`; `SupabaseProofStore` (`@supabase/supabase-js` with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, bucket `PROOF_BUCKET`, `upsert: false`; the bucket is **private**) and `MemoryProofStore` for tests; `getProofStore()`. Two objects per proof: `raw/<hash>` (the original bytes, **never served to anyone**; retained so `verify` can re-hash and for disputes) and `img/<hash>.jpg` (the stripped copy, the only object a URL ever points at).
- Idempotent upload: the same bytes from the same worker → 200 with the existing row; the same hash from a **different** worker → 409 `conflict` (`reason: 'hash_owned_by_other_worker'`).
- `proofs` row: `hash`, `storage_key = 'img/<hash>.jpg'`, `captured_at = new Date()` (server time — the client's clock is never trusted), `exact_lat/lon/accuracy` (or null), `gps_unavailable`, `worker` (session), `task_id = null`, `place_id = null` (T-17 sets both at submit).
- `signedUrl.ts`: `signProofUrl(hash, expiresAtS: number) → string` = `` `${API_BASE_URL}/proofs/${hash}?exp=${expiresAtS}&sig=${hmacSha256Hex(PROOF_URL_SECRET, `${hash}.${expiresAtS}`)}` ``; `verifyProofUrl(hash, exp, sig, nowS) → boolean` with `timingSafeEqual` and `nowS < exp`. The URL returned by `POST /proofs` to the worker expires in **1 hour**; buyer URLs are minted by T-19 with `expiresAt = submitted_at + dispute_window_s + 3600` ("dispute window + 1 h").
- `GET /proofs/:hash?exp=&sig=` (`apps/api/app/proofs/[hash]/route.ts`): verify → stream `img/<hash>.jpg` with `Content-Type: image/jpeg`, `Cache-Control: private, no-store`; bad or expired signature → **403** `forbidden`; unknown hash with a valid signature → 404. Never serves `raw/`.
- `geo.ts`: `round100m(lat, lon) → {lat, lon}` = `Math.round(x * 1000) / 1000` per component (`PUBLIC_COORD_DECIMALS = 3`); `distanceM(a, b)` haversine in metres (exported for T-17 if it prefers to import it).
- `GET /public/proofs/:hash/verify`: `{hash, exists, hash_ok, captured_at, coordinate_rounded?: {lat, lon}, gps_unavailable, size_bytes, served_hash}` — `hash_ok = keccak256(raw/<hash>) === hash` computed **at request time**; `coordinate_rounded` only when GPS was present, always through `round100m`; `served_hash = keccak256(img/<hash>.jpg)` so a client that re-hashes the served image can match *that* and understand why it differs from `hash` (re-encoded copy). Never `exact_*`, never `worker`, never a URL. Rate-limited 60/min per client.
- Response of `POST /proofs`: `{proofHash, url, captured_at}` exactly (plus nothing).

## 3. Out of scope
- Submit-time checks (reuse, geofence, downgrade) and setting `proofs.task_id/place_id` — **T-17**. Minting buyer URLs and `proof.url`/`hash_ok` inside `GET /tasks/:id` — **T-19** (it imports `signProofUrl` and `rehash` from here).
- Sessions, wrapper, DB client — **T-08**. Any onchain call — none here.
- Do not touch: `apps/api/app/tasks/**`, `apps/api/app/public/**` except `proofs`, `apps/api/src/db/schema.ts`, `apps/api/src/{config,log,errors,session,chain}.ts`, `packages/**`.

## 4. Owned paths
```
apps/api/app/proofs/**
apps/api/app/public/proofs/**
apps/api/src/services/{proofStore,exif,signedUrl,geo}.ts
apps/api/app/proofs/proofs.test.ts
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `requireWorkerSession`, `route`, `ApiError`, `rateLimit`, `clientKey`, `getConfig`, `getDb`, `logger`, `createTestDb`, `call` | `apps/api/src/**`, `apps/api/test/**` (T-08) | session `{worker, nullifier}`; envelope; harness |
| `proofs` table | `apps/api/src/db/schema.ts` (T-01, frozen) | columns above; `hash` is the PK |
| `keccak256`, `toHex` | `viem` | hash of raw bytes |
| `sharp` | catalog | `rotate()`, `jpeg()`, `metadata()`; metadata dropped by default |
| `@supabase/supabase-js` storage | catalog | `storage.from(bucket).upload/download`; service-role key server-side only |
| `PUBLIC_COORD_DECIMALS`, `GEOFENCE_M` | `@legwork/shared` (T-01) | 3 decimals; 150 m |
| Env | `.env.example` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PROOF_BUCKET`, `PROOF_URL_SECRET`, `API_BASE_URL` |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `POST /proofs`, `GET /proofs/:hash?exp=&sig=`, `GET /public/proofs/:hash/verify` | `apps/api/app/proofs/**`, `apps/api/app/public/proofs/**` | mini-app (lane D), dashboard proof card, T-19, T-27 `task_status` |
| `signProofUrl`, `verifyProofUrl` | `apps/api/src/services/signedUrl.ts` | T-19 (`proof.url` with buyer token) |
| `ProofStore`, `getProofStore`, `MemoryProofStore`, `rehash(hash) → {hash_ok, served_hash}` | `apps/api/src/services/proofStore.ts` | T-19 (`hash_ok`), tests in T-17/T-19 |
| `round100m`, `distanceM` | `apps/api/src/services/geo.ts` | T-19 (`coordinate_rounded`), T-17 (optional import) |
| `stripImage`, `assertNoMetadata` | `apps/api/src/services/exif.ts` | tests |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-18` — it must print `CLAIMED T-18`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read T-08's `session.ts`, `http/route.ts`, `test/app.ts`, the frozen `proofs` columns, and sharp's metadata notes in its README under `node_modules`.
2. `geo.ts` + the `round100m` vector test. `signedUrl.ts` + expiry/tamper tests. `exif.ts`: build a JPEG fixture **in the test** with sharp (`sharp({create:{width: 64, height: 64, channels: 3, background:'#888'}}).jpeg().withMetadata({exif: {IFD0: {Make:'Legwork-Test', Software:'fixture'}, GPS: {GPSLatitude: …}}, orientation: 6}).toBuffer()`) — no binary fixture committed.
3. `proofStore.ts` (memory first, Supabase second); the two-object layout; `rehash`.
4. `POST /proofs` per §2; `GET /proofs/:hash`; `GET /public/proofs/:hash/verify`.
5. `proofs.test.ts` with `describe('/proofs unit test', …)` and the cases in §8. Run §9.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `/proofs unit test` › `stripsExif` | uploading the fixture with EXIF `Make`, GPS tags and `orientation: 6`: the stored `img/<hash>.jpg` has no `exif`, `icc`, `iptc`, `xmp`, `orientation` in `sharp().metadata()`; width/height are swapped relative to the fixture (orientation applied); the raw fixture bytes are unchanged in `raw/<hash>` |
| `/proofs unit test` › `proofHashIsKeccakOfUploadedBytes` | response `proofHash === keccak256(fixtureBytes)`; it differs from `keccak256(storedJpeg)`; `verify` reports `hash_ok: true` and `served_hash === keccak256(storedJpeg)`; flipping one byte in `raw/<hash>` in the memory store makes `hash_ok: false` |
| `/proofs unit test` › `signedUrlExpiryAndTamper` | `GET` on the returned `url` → 200 `image/jpeg`; with `exp` past → 403; with one hex digit of `sig` changed → 403; with `exp` moved later but the old `sig` → 403; the URL of a `raw/` key is never constructible (no route serves it) |
| `/proofs unit test` › `round100mVector` | `round100m(39.74362, -8.80713)` deep-equals `{lat: 39.744, lon: -8.807}`; `verify` for a proof at `(39.74362, -8.80713)` returns `coordinate_rounded: {lat: 39.744, lon: -8.807}` and the JSON text does not contain `39.74362` or `-8.80713` |
| `/proofs unit test` › `gpsInvariant` | `lat` without `lon` → 400; `gps_unavailable: true` without `worker_confirmed_at_place: true` → 400; `lat/lon` with `gps_unavailable: true` → 400; `gps_unavailable: true, worker_confirmed_at_place: true` → 200 with `exact_lat/lon` null in the row |
| `/proofs unit test` › `sizeAndTypeLimits` | a 8 MB + 1 byte upload → 413 `payload_too_large` with `max_bytes`; a `text/plain` body → 400 `unsupported_type`; a PNG fixture → 200 and the stored object is JPEG |

## 9. Verification commands
```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/api typecheck && pnpm --filter @legwork/api test -- -t "/proofs unit test"
pnpm --filter @legwork/api test -- -t round100mVector
grep -rn "withMetadata" apps/api/src/services/exif.ts                 # must print nothing
grep -rn "raw/" apps/api/app/proofs/\[hash\]/route.ts                  # must print nothing (raw is never served)
grep -rn "exact_lat\|exact_lon" apps/api/app/public/proofs             # must print nothing in a response object
scripts/ci/banned-words.sh apps/api
```
Expected: the `/proofs unit test` suite green; three greps print nothing.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). This task shows no money.
- No secrets in code or client bundles; read keys only from `process.env`; `.env.example` is the only env file in git. `SUPABASE_SERVICE_ROLE_KEY` and `PROOF_URL_SECRET` are read in `getConfig()` only; the bucket stays private — no public-bucket fallback, ever.
- Tests never call a live model or a live chain (`LIVE_LLM`/`LIVE_CHAIN` gated files excepted); never Supabase — `MemoryProofStore` only; fixtures are generated in the test, none committed.
- `proofHash` is the keccak256 of the bytes as uploaded — never of the re-encoded image, never of a resized one.
- The exact coordinate lives in `proofs.exact_*` and nowhere else; every public or buyer-facing coordinate goes through `round100m`; `distance_m`-style derived values are T-17's, behind a worker-session.
- `captured_at` is server time; a client-supplied timestamp is ignored (not stored).
- `raw/<hash>` is never served by any route; the worker's own URL and the buyer's URL both point at `img/<hash>.jpg`.
- Never log raw spec text — this task never sees a spec; it logs `hash`, `size_bytes`, `worker` (address), never `lat/lon`.
- `agentId` is never trusted from the body — no route here reads one. Schema errors are 400 and never mark — nothing here marks.
- Honesty line for the code comments and the verify response docs, verbatim: "GPS is self-reported and spoofable; we anchor it, geofence it, and dispute outside the radius — we do not prove it."

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** (suite `/proofs unit test`) and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed.
- [ ] Verification output from §9 pasted into the PR.
- [ ] Route documentation as a comment block at the top of `proofStore.ts` (`apps/api/README.md` is T-08's).
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-18 — POST /proofs — hash raw bytes, strip EXIF, private store, signed URLs, rounding
owned-paths:
  - apps/api/app/proofs/**
  - apps/api/app/public/proofs/**
  - apps/api/src/services/{proofStore,exif,signedUrl,geo}.ts
  - apps/api/app/proofs/proofs.test.ts
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.

Known gaps to raise as written:
- `INTERFACE REQUEST: docs/api.md — add GET /proofs/:hash?exp=&sig= (signed-URL image route, 403 on expiry/tamper) and the verify response fields {exists, size_bytes, served_hash}`.
- `DEP REQUEST: sharp, @supabase/supabase-js in apps/api` — only if the catalog lacks them; sharp needs the Node runtime (already forced by T-08's route convention).
- `ENV REQUEST: Vercel function memory for sharp` — if the 8 MB re-encode exceeds the default, ask the operator to raise the function memory; do not shrink the limit.

## 14. Reviewer notes
Open `app/proofs/route.ts` first: `keccak256(raw)` computed before `stripImage`; the two-object layout; `captured_at = new Date()`. Then `exif.ts`: no `withMetadata`, `rotate()` present. Then `signedUrl.ts`: HMAC over `hash.exp`, `timingSafeEqual`, expiry checked. Then `public/proofs/[hash]/verify`: re-hash at request time, `round100m` on the way out, no `exact_*`. Most likely wrong: hashing the JPEG instead of the raw bytes; `orientation` surviving because `rotate()` was skipped; a public Supabase bucket "for now"; the worker's URL minted for the dispute window instead of 1 hour; `39.74362` leaking through a debug field.

## 15. Round 2+
—
