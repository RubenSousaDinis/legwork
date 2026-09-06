---
id: T-20
title: World ID v4 — /idkit/request, /idkit/verify, /register (EIP-712 attestation), /config/world
lane: B
day: 2
size: M
agent_class: C
must: true
depends_on: [T-08, T-07]
owned_paths:
  - apps/api/app/idkit/**
  - apps/api/app/register/**
  - apps/api/app/config/**
  - apps/api/src/services/worldId.ts
  - apps/api/src/services/attestation.ts
  - apps/api/test/routes/idkit*.test.ts
  - contracts/test/fixtures/attestation.json
labels: [area:api, wave:2, size:M, agent:cloud]
branch: t-20/idkit-register
---

# T-20 — World ID v4 — /idkit/request, /idkit/verify, /register (EIP-712 attestation), /config/world

## 1. Context
A worker becomes a worker in three server-side steps: the mini-app (lane D) asks the API for an RP-signed request (`/idkit/request`), the World App returns an IDKit proof which the API forwards to World's v4 verify endpoint (`/idkit/verify`) and turns into an idkit-session, and the worker picks an address, area and task types (`/register`) which the API binds onchain by signing an EIP-712 attestation with the operator's verifier key and relaying `registerFor`. The API is the World ID relying party, so `WORLD_RP_SIGNING_KEY` lives only here; `GET /config/world` tells the client which app, action and credential level to ask for and nothing else. The attestation digest is the one thing Solidity (T-11) and TypeScript must compute identically — the fixture this task writes is the shared vector. Registration is operator-attested and runs against World's staging environment; the chips "sandbox World ID" and "operator-attested" describe exactly this task.

> **02-architecture.md — Task API (worker side):** …and the worker-session routes: `POST /session` (walletAuth SIWE verified server-side, bound to the stored nullifier), `POST /register`, `GET /tasks?area=` (3-second poll), `POST /tasks/:id/claim`, `POST /tasks/:id/release-claim` (give up, no penalty inside the TTL), `POST /proofs`, `POST /tasks/:id/submit`, `POST /tasks/:id/report` (optional).

> **02-architecture.md — security rows:** **FIX** Fake / duplicate workers | One nullifier = one account; attestation domain-bound with a deadline and (nullifier, worker) binding; a known nullifier reverts | `test_Register_DuplicateNullifierReverts`, `test_Register_ReplayedAttestationReverts` · **FIX** Seeded workers mint "verified humans" | `seedWorker` is a separate owner-only path emitting `WorkerSeeded`; seeded workers can only claim operator-funded tasks; the flag is indexed and rendered · **FIX** Operator key compromise | Four keys with one job each; `pause` on `post`/`claim` only; single-signer disclosed.

> **T-01 (frozen) rows:** `POST /idkit/request` | public | `{action}` → `rp_context {rp_id, nonce, created_at, expires_at, signature}` · `POST /idkit/verify` | public | IDKit result payload (forwarded as-is to `POST https://developer.world.org/api/v4/verify/{rp_id}`) → `{verified:true, nullifier, level}` + idkit-session cookie; **409** `{error:'nullifier_already_registered'}` · `POST /register` | idkit-session | `{worker_address, area, task_types}` → `{tx, worker}` (EIP-712 attestation signed by the verifier key, `deadline = now + 600`, then relayed `registerFor`) · `POST /session` | idkit-session **or** dev path | … `{mode:'idkit', worker_address}` → worker-session cookie (T-08's route; this task only makes the idkit-session it needs) · Generic error bodies: **400** `{error:'invalid_request', field, reason}` · **401** `{error:'unauthorized'}` · **429** `{error:'rate_limited', retry_after_s}`.
> **`IWorkerRegistry`:** `registerFor(uint256 nullifierHash, address worker, string area, uint8 taskTypes, uint256 deadline, bytes attestation)` — `onlyRelayer`. Reverts: `NotRelayer`, `DuplicateNullifier`, `WorkerAlreadyBound`, `AttestationExpired`, `BadAttestation`, `AttestationUsed`. EIP-712: domain name `"Legwork WorkerRegistry"`, version `"1"`, `chainId`, `verifyingContract`. Typehash `Attestation(uint256 nullifierHash,address worker,string area,uint8 taskTypes,uint256 deadline)` (the `string` is hashed with `keccak256(bytes(area))` per EIP-712). `usedDigest[digest]` prevents replay. Task-type bitmask: `verify-open = 1`, `photo-of = 2`, `call-confirm = 4`, `compare-two = 8`. Nullifiers are `uint256` (the World ID `nullifier` hex parsed as a 256-bit integer). Table `nullifiers` (`nullifier NUMERIC(78,0)` UNIQUE, `action`, `worker`). `docs/keys.md`: relayer (`registerFor` …) · attestation verifier (signs EIP-712 attestations; never onchain). Env: `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_RP_SIGNING_KEY`, `WORLD_ACTION=legwork-worker`, `WORLD_ENV=staging`, `WORLD_CREDENTIAL_LEVEL=selfie|orb`, `ATTESTATION_VERIFIER_PRIVATE_KEY`, `WORKER_REGISTRY_ADDRESS`, `CHAIN_ID=84532`.

## 2. Exact scope
- `worldId.ts`: `signRpRequest(action) → RpContext` — `signRequest` from `@worldcoin/idkit-core/signing` with `getConfig().worldRpSigningKey` (argument order per the installed `signing.d.ts` — read it, do not guess) returns `{sig, nonce, createdAt, expiresAt}`; map to `{rp_id: WORLD_RP_ID, nonce, created_at: createdAt, expires_at: expiresAt, signature: sig}`. `verifyWithWorld(rawBody: string) → Promise<{ok: true, nullifier: string, level: string, action: string, protocol_version: string} | {ok: false, status: number, code: string}>` — `fetch('https://developer.world.org/api/v4/verify/' + WORLD_RP_ID, {method:'POST', headers:{'content-type':'application/json'}, body: rawBody})` where `rawBody` is `await req.text()` **exactly as received** (never `JSON.stringify(JSON.parse(…))`, never a field added or removed); `level` = the credential World reports in its response (`verification_level`, else `credential_type`), else the payload's `verification_level`, else `WORLD_CREDENTIAL_LEVEL`. `nullifierToNumeric(hex) → string` = `BigInt(hex).toString(10)` after `^0x[0-9a-fA-F]{1,64}$`; this decimal string is what the `NUMERIC(78,0)` column stores.
- `POST /idkit/request` (rate-limit 30/min per client): body `{action}` zod; `action !== WORLD_ACTION` → 400 `{error:'invalid_request', field:'action', reason:'unknown_action'}`; → 200 `{rp_context: {rp_id, nonce, created_at, expires_at, signature}}`.
- `POST /idkit/verify` (rate-limit 30/min): read the body once as text; it must parse as a JSON object whose `action === WORLD_ACTION` (else 400, field `action`) — the parsed copy is used for reading only, the text is what is forwarded. World non-2xx → 400 `{error:'invalid_request', field:'proof', reason: <World's code or 'http_<status>'>}`; World response `action !== WORLD_ACTION` → 400. On success: `nullifier = nullifierToNumeric(res.nullifier)`; `insert nullifiers {nullifier, action, worker: null} onConflictDoNothing`, then select the row: `worker !== null` → **409** `{error:'nullifier_already_registered'}` and no cookie; else issue the idkit-session with T-08's helper (`session.ts`; payload `{nullifier, level}` — `nullifier` as the decimal string) and return `{verified: true, nullifier: <0x-hex as World returned it>, level}`.
- `attestation.ts`: `ATTESTATION_TYPES = {Attestation: [{name:'nullifierHash', type:'uint256'}, {name:'worker', type:'address'}, {name:'area', type:'string'}, {name:'taskTypes', type:'uint8'}, {name:'deadline', type:'uint256'}]}`; `attestationDomain(chainId, verifyingContract) = {name:'Legwork WorkerRegistry', version:'1', chainId, verifyingContract}`; `attestationDigest(domain, message) = hashTypedData({domain, types: ATTESTATION_TYPES, primaryType:'Attestation', message})` (viem); `signAttestation(privateKey, domain, message) → Hex` = `privateKeyToAccount(privateKey).signTypedData({…same…})`; `taskTypesMask(task_types: TaskType[]) → number` = OR of `TASK_TYPE_BIT`, deduped, must be `1..15`; `verifierAddress()` = `privateKeyToAccount(getConfig().attestationVerifierPrivateKey).address`. `chainId = getConfig().chainId` (84532), `verifyingContract = WORKER_REGISTRY_ADDRESS`.
- `POST /register` (`requireIdkitSession` → 401 `unauthorized`; rate-limit 10/min): body zod `{worker_address: isAddress, area: /^[0-9b-hjkmnp-z]{5}$/, task_types: TaskType[] non-empty}` → 400 `invalid_request` with the field. `worker = getAddress(worker_address)` (checksummed). Load the `nullifiers` row for the session nullifier: missing → 401; `worker !== null` → 409 `nullifier_already_registered`. `message = {nullifierHash: BigInt(nullifier), worker, area, taskTypes: taskTypesMask(task_types), deadline: BigInt(floor(Date.now()/1000) + 600)}`; `attestation = signAttestation(verifierKey, domain, message)`; `getChain().registerFor(nullifierHash, worker, area, taskTypes, deadline, attestation)` (the adapter's relayer-key write; T-07 ships no `TxQueue.send`) (signature per T-07 — read `packages/chain/src` first) → on the returned hash `update nullifiers set worker = <worker> where nullifier = …` → 200 `{tx, worker}`. Decoded reverts: `DuplicateNullifier` → 409 `nullifier_already_registered`; `WorkerAlreadyBound` → 409 `{error:'worker_already_bound'}`; `AttestationExpired | BadAttestation | AttestationUsed` → 500 `{error:'attestation_rejected', name}` (a server bug — log `name`, never the attestation); transport failure → 503 `{error:'chain_unavailable'}`. The DB row is updated only after the hash is returned; never before.
- `GET /config/world` (`Cache-Control: public, max-age=60`): exactly `{app_id: WORLD_APP_ID, action: WORLD_ACTION, rp_id: WORLD_RP_ID, credential_level: WORLD_CREDENTIAL_LEVEL, env: WORLD_ENV}` — five keys, built as a literal object from `getConfig()`, never by spreading a config object.
- Fixture `contracts/test/fixtures/attestation.json` — test signer key derived, never written down: `pk = keccak256(stringToBytes('legwork-test-verifier'))`; `signer = privateKeyToAccount(pk).address`. Message: `chainId: 84532`, `verifyingContract: "0x1111111111111111111111111111111111111111"`, `nullifierHash: "<decimal string of keccak256(stringToBytes('legwork-test-nullifier')) as uint256>"`, `worker: "0x2222222222222222222222222222222222222222"`, `area: "ez1dp"`, `taskTypes: 3`, `deadline: 4102444800`. Fields: `{chainId, verifyingContract, nullifierHash, worker, area, taskTypes, deadline, digest, signature, signer, keyDerivation: "keccak256(utf8('legwork-test-verifier'))", domain: {name:'Legwork WorkerRegistry', version:'1'}}`. Generated by the test in §8 when `REGEN_FIXTURE=1`; committed once; the Forge side (T-11 follow-up) recomputes the digest and `vm.sign(uint256(keccak256("legwork-test-verifier")), digest)` against it.
- Tests use `msw` (`setupServer` from `msw/node`, `onUnhandledRequest: 'error'`) for World, `FakeChain` behind `TxQueue`, pglite via T-08's `createTestDb`. Test env keys are derived the same way (`WORLD_RP_SIGNING_KEY` in the format `signing.d.ts` expects, from `keccak256(stringToBytes('legwork-test-rp-signing'))`; `ATTESTATION_VERIFIER_PRIVATE_KEY` = the fixture key) — no literal key anywhere in the repo.

## 3. Out of scope
- `GET /session/nonce`, `POST /session` (both modes, the seeded dev path), cookie helpers, `idkit_sessions`/`sessions` rows — **T-08**. The `WorkerRegistry` contract and its Forge tests, the fixture's Solidity consumer — **T-11** (follow-up). `TxQueue`, nonce handling, gas — **T-07**. `seedWorker`/`resetWorker` calls — **T-14/T-29/T-19**. The mini-app's IDKit widget and SIWE flow — lane D. Worker routes (`/tasks?area=`, `claim`, `submit`) — **T-17**.
- Do not touch: `apps/api/app/session/**`, `apps/api/app/tasks/**`, `apps/api/src/db/schema.ts`, `apps/api/src/{config,log,errors,session,chain}.ts`, `packages/**`, `contracts/src/**`, `contracts/test/**` except the fixture.

## 4. Owned paths
```
apps/api/app/idkit/**
apps/api/app/register/**
apps/api/app/config/**
apps/api/src/services/{worldId,attestation}.ts
apps/api/test/routes/idkit*.test.ts
contracts/test/fixtures/attestation.json
```

## 5. Interfaces consumed
| Interface | Where | What you rely on |
|---|---|---|
| `route`, `ApiError`, `rateLimit`, `clientKey`, `getConfig`, `getDb`, `logger`, `requireIdkitSession`, idkit-session issuer, `createTestDb`, `call` | `apps/api/src/**`, `apps/api/test/**` (T-08) | envelope; cookie set/read; `worldAppId/worldRpId/worldRpSigningKey/worldAction/worldEnv/worldCredentialLevel/attestationVerifierPrivateKey/workerRegistryAddress/chainId` |
| `TxQueue`, `FakeChain` | `@legwork/chain` (T-07) | the adapter's own write methods (`claimFor`, `approve`, `registerFor`, `pause`, … → `{hash}`; T-07 ships no `send({role, …})` — the role is bound to the method); decoded revert names; `FakeChain.calls[]` with role + args; `failNextWith(name)` |
| `nullifiers` table | `apps/api/src/db/schema.ts` (T-01, frozen) | `nullifier NUMERIC(78,0)` UNIQUE (decimal string in TS), `action`, `worker` nullable |
| `signRequest` | `@worldcoin/idkit-core/signing` | `{sig, nonce, createdAt, expiresAt}` |
| `hashTypedData`, `signTypedData`, `recoverTypedDataAddress`, `privateKeyToAccount`, `keccak256`, `stringToBytes`, `isAddress`, `getAddress` | `viem` | digest, signature, recovery, key derivation |
| `TaskType`, `TASK_TYPE_BIT` | `@legwork/shared` (T-01) | bitmask 1/2/4/8 |
| World ID v4 verify | `POST https://developer.world.org/api/v4/verify/{rp_id}` | response carries `nullifier` (0x-hex), `protocol_version`, `action` |

## 6. Interfaces produced
| Interface | Where | Consumers |
|---|---|---|
| `POST /idkit/request`, `POST /idkit/verify`, `POST /register`, `GET /config/world` | `apps/api/app/{idkit,register,config}/**` | mini-app onboarding (lane D), T-36 e2e (config only; workers there are seeded) |
| `ATTESTATION_TYPES`, `attestationDomain`, `attestationDigest`, `signAttestation`, `taskTypesMask`, `verifierAddress` | `apps/api/src/services/attestation.ts` | T-14 (verifier address at deploy), T-36 |
| `signRpRequest`, `verifyWithWorld`, `nullifierToNumeric` | `apps/api/src/services/worldId.ts` | T-08 (`/session` idkit mode may reuse `nullifierToNumeric`) |
| `contracts/test/fixtures/attestation.json` | fixture | T-11 follow-up (`test_Register_FixtureDigestMatchesApi`) |

## 7. Step list

**0. Claim it first.** `scripts/claim.sh T-20` — it must print `CLAIMED T-20`. If it exits 1, another agent already holds this task, or a dependency has not merged: **stop, say which, and do nothing else.** The script creates your branch **and opens your PR as a draft** with the `owned-paths:` block already filled in — never run `gh pr create` yourself.
1. Read T-08's `session.ts` (idkit-session issue/require), `http/route.ts`, `config.ts`, `test/app.ts`; T-07's `TxQueue`/`FakeChain`; `node_modules/@worldcoin/idkit-core/dist/signing.d.ts` for `signRequest`'s argument order and key format; the frozen `nullifiers` columns.
2. `attestation.ts` + the fixture generator test (`REGEN_FIXTURE=1` writes the JSON; without it the test compares). Commit the fixture.
3. `worldId.ts` with `fetch` from `globalThis` (msw intercepts it); `nullifierToNumeric` vectors (`0x01` → `"1"`, `0xff…ff` (64 f) → the 78-digit max).
4. Routes: `/config/world`, `/idkit/request`, `/idkit/verify`, `/register`. `DEP REQUEST: msw` and `@worldcoin/idkit-core` in `apps/api` if the catalog lacks them.
5. `idkit.test.ts` with the five tests of §8; run §9.

## 8. Acceptance tests
| Test / command | Asserts |
|---|---|
| `registerBindsNullifierToWorker` | seed `nullifiers {nullifier: N (decimal), action: 'legwork-worker', worker: null}` and an idkit-session for `N`; `POST /register {worker_address: '0x2222…2222' lowercase, area: 'ez1dp', task_types: ['verify-open','photo-of']}` → 200 `{tx, worker: '0x2222…2222' checksummed}`; `FakeChain.calls` has exactly one `registerFor` from role `relayer` with args `[BigInt(N), checksummed worker, 'ez1dp', 3, deadline, attestation]` where `deadline` is within 5 s of `now + 600` and `recoverTypedDataAddress({domain, types, primaryType, message, signature: attestation}) === verifierAddress()`; the `nullifiers` row now has `worker` set; a duplicate `task_types` entry yields the same mask |
| `duplicateNullifierIs409` | (a) `/idkit/verify` (msw returns success for a nullifier whose row has `worker` set) → 409 `{error:'nullifier_already_registered'}` and no `Set-Cookie`; (b) `/register` with a session for that bound nullifier → 409 same body and zero `registerFor` calls; (c) fresh row + `FakeChain.failNextWith('DuplicateNullifier')` → 409 same body and the row's `worker` stays `null` |
| `attestationDigestMatchesForge` | load the fixture; `attestationDigest(domain, message) === fixture.digest`; `recoverTypedDataAddress(...) === fixture.signer`; `signAttestation(derivedKey, …) === fixture.signature` (RFC 6979 — deterministic); `privateKeyToAccount(derivedKey).address === fixture.signer`; `fixture.deadline === 4102444800`, `fixture.taskTypes === 3` |
| `verifyForwardsPayloadAsIs` | msw handler on `https://developer.world.org/api/v4/verify/:rp_id` captures `await request.text()`; the test sends the body string `{"z":1, "action":"legwork-worker",  "proof":"0xabc","verification_level":"orb"}`; captured text `===` that string byte for byte, `params.rp_id === WORLD_RP_ID`, `content-type` is `application/json`; msw returns `{success:true, nullifier:'0x1f'+'a'.repeat(62), protocol_version:'4.0', action:'legwork-worker'}` → 200 `{verified:true, nullifier:'0x1f…', level:'orb'}` with a `Set-Cookie` idkit-session; the `nullifiers` row equals `BigInt('0x1f…').toString()`; msw returning 400 `{code:'invalid_proof'}` → 400 `{error:'invalid_request', field:'proof', reason:'invalid_proof'}` and no row; any other host → the test fails (`onUnhandledRequest: 'error'`) |
| `configNeverLeaksSigningKey` | `GET /config/world` body deep-equals `{app_id, action, rp_id, credential_level, env}` from the test env with no extra key; `JSON.stringify(body)` contains neither the test `WORLD_RP_SIGNING_KEY` value nor the test `ATTESTATION_VERIFIER_PRIVATE_KEY` value (hex or base64 form); `POST /idkit/request {action:'legwork-worker'}` → 200 with the five `rp_context` fields, `expires_at > created_at`, and the same two strings absent; `{action:'other'}` → 400 field `action` |

## 9. Verification commands
```bash
# run before opening the PR; paste the output into the PR body
pnpm --filter @legwork/api typecheck
pnpm --filter @legwork/api test -- -t registerBindsNullifierToWorker
pnpm --filter @legwork/api test -- -t duplicateNullifierIs409
pnpm --filter @legwork/api test -- -t attestationDigestMatchesForge
pnpm --filter @legwork/api test -- -t verifyForwardsPayloadAsIs
pnpm --filter @legwork/api test -- -t configNeverLeaksSigningKey
grep -rn "JSON.stringify" apps/api/src/services/worldId.ts                    # must print nothing (payload forwarded as text)
grep -rn "worldRpSigningKey\|attestationVerifierPrivateKey" apps/api/app      # must print nothing (keys read in services only)
grep -rn "writeContract" apps/api/app apps/api/src/services                   # must print nothing (TxQueue only)
grep -rEn "0x[0-9a-fA-F]{64}" apps/api/test/routes/idkit*.test.ts contracts/test/fixtures/attestation.json | grep -v "digest\|signature\|nullifierHash"   # must print nothing (no literal key)
scripts/ci/banned-words.sh apps/api contracts/test/fixtures
```
Expected: five tests green; the four greps print nothing.

## 10. Hard rules
- Banned words anywhere in code, comments, docs or UI copy: `trustless`, `reused`, `violation`, `Brooklyn`, `24h`, `2.55`, `21 workers`.
- Money figures on every surface: agent pays **3.45**, escrow locks **3.45**, worker receives **3.00**, fee **0.45** (15 % on top; the worker keeps the posted rate). This task shows no money.
- No secrets in code or client bundles; read keys only from `process.env` via `getConfig()`; `.env.example` is the only env file in git. `WORLD_RP_SIGNING_KEY` and `ATTESTATION_VERIFIER_PRIVATE_KEY` are read inside `worldId.ts`/`attestation.ts` only and never leave the server: never in a response, a cookie, a log line, an error message or `/config/world`.
- Tests never call a live model or a live chain (`LIVE_LLM`/`LIVE_CHAIN` gated files excepted); never World, never a facilitator — `msw` with `onUnhandledRequest: 'error'`, `FakeChain`, pglite. Test keys are derived from a seed string at runtime; no literal private key in the repo.
- Every chain write goes out through the adapter's relayer queue (`getChain().registerFor`); the verifier key signs offchain only and never sends a transaction.
- The IDKit result payload is forwarded byte for byte; the API adds, removes or reorders nothing. `action` must equal `WORLD_ACTION` in the request body, in the forwarded payload and in World's response.
- One nullifier = one worker: the `nullifiers` UNIQUE row and the chain's `DuplicateNullifier` both surface as 409 `{error:'nullifier_already_registered'}`; a bound nullifier never gets a new idkit-session.
- `deadline = now + 600`, computed once per request; the digest is never stored (the contract's `usedDigest` is the replay guard).
- `/register` never emits or simulates `WorkerSeeded`; seeded workers are `seedWorker` (owner) only and never pass through this route.
- Never log raw spec text — this task never sees a spec; log `worker` (address), `tx`, revert `name`; never the proof payload, the attestation bytes, the cookie or a nullifier.
- Honesty lines for the doc comments, verbatim: "sandbox World ID" (staging environment, `WORLD_ENV=staging`) and "operator-attested" (the attestation verifier is the operator's key; a compromise of that key is a disclosed single-signer risk).

## 11. Definition of done
- [ ] Every acceptance test in §8 exists **with that exact name** and passes.
- [ ] CI green: `contracts`, `ts`, `subgraph-build`, `banned-words`, `path-ownership`, `commit-trailers`, `secrets`, `no-live-llm`.
- [ ] Only files under §4 changed; `contracts/test/fixtures/attestation.json` committed with the fields of §2.
- [ ] Verification output from §9 pasted into the PR.
- [ ] Route documentation as a comment block at the top of `worldId.ts` (`apps/api/README.md` is T-08's).
- [ ] Every commit carries the trailer `AI-Usage: <tool+model> drafted <what>; human <reviewed|edited> <what>`.

## 12. PR checklist (your draft PR body is already pre-filled — complete it, then `gh pr ready`)
```
Task: T-20 — World ID v4 — /idkit/request, /idkit/verify, /register (EIP-712 attestation), /config/world
owned-paths:
  - apps/api/app/idkit/**
  - apps/api/app/register/**
  - apps/api/app/config/**
  - apps/api/src/services/{worldId,attestation}.ts
  - apps/api/test/routes/idkit*.test.ts
  - contracts/test/fixtures/attestation.json
Scope confirmed: every §2 bullet done · Out-of-scope respected · §8 tests present by name · §9 output pasted below
AI-Usage: <one line>
BLOCKED items resolved: <none | list>
```

## 13. If blocked
Comment `BLOCKED: <exactly what you need — an interface, an env var, a dependency, a decision>` on the PR (or the issue), stop, and do not work around it. Interfaces in `packages/shared`, `contracts/src/interfaces`, `subgraph/schema.graphql` and `apps/api/src/db/schema.ts` are frozen: request a change with `INTERFACE REQUEST:`, never patch them. Dependencies: `DEP REQUEST:`. Env vars: `ENV REQUEST:`.

Known gaps to raise as written:
- `INTERFACE REQUEST: docs/api.md — POST /idkit/request response is {rp_context: {…}} (wrapped); /register error bodies 409 {worker_already_bound}, 500 {attestation_rejected, name}, 503 {chain_unavailable}; GET /config/world listed as public`.
- `INTERFACE REQUEST: T-07 FakeChain — calls[] must record role and decoded args (bigint for uint256), and failNextWith('DuplicateNullifier') must decode to that name` — only if absent.
- `DEP REQUEST: msw, @worldcoin/idkit-core in apps/api` — only if the catalog lacks them. If `signRequest` needs a key format the derivation cannot produce, `BLOCKED:` with the format quoted from `signing.d.ts`.

## 14. Reviewer notes
Open `worldId.ts` first: `req.text()` forwarded unchanged (no `JSON.stringify`), `action` checked three times, `nullifierToNumeric` decimal. Then `attestation.ts`: types in the frozen order, domain name/version exact, `taskTypes` a `uint8` mask, `deadline` a `bigint`. Then `app/register/route.ts`: 401 before 400, the row updated after the hash, revert mapping. Then `app/config/world/route.ts`: a five-key literal. Then the fixture against `hashTypedData`. Most likely wrong: `signRequest` argument order guessed; `nullifier` stored as hex in a `NUMERIC` column; `area` hashed by hand instead of letting `hashTypedData` handle the `string`; the DB row bound before the tx hash is returned (a revert then leaves a phantom binding); a literal test key that trips the `secrets` check.

## 15. Round 2+
—
