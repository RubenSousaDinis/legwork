# `/proof/<task_id>` — capture, location, answer, submit, paid

The beat the whole submission rests on: a real person photographs the door, the app records
what it can about where and when, the relayer submits, and the escrow releases **3.00 USDC**
to the worker while the agent's **0.45** fee goes to the treasury.

| file | what it is |
|---|---|
| `[id]/page.tsx` | `requireVerified()`, then the claim gate: `readActiveClaim().task_id === id`, else `/tasks` |
| `ProofFlow.tsx` | the four steps, the upload, the submit, the long poll |
| `image.ts` | `reencodeImage(file)` — canvas → JPEG, long edge ≤ 1600 px, quality 0.85 |
| `upload.ts` | `uploadProof(form)` — `POST /proofs`, multipart |
| `AnswerToggle.tsx` | the per-type answer, segmented, nothing preselected |
| `Downgrade.tsx` | the location step and the panel a failed fix leaves behind |
| `PaidState.tsx` | released, and only ever below the proof photo |

`components/Countdown.tsx` (T-25) is the `submit within` clock and `app/tasks/activeClaim.ts`
is the claim gate. `lib/gps.ts` is the one fix attempt.

## The GPS downgrade is a path, not a fallback

World App exposes no location permission of its own, so `getCurrentPosition` inside the
webview may hang, be denied, or answer with nothing at all. That was decided in advance
(02-architecture, 10-schemas §3), so it is built as a first-class path rather than an error
screen:

1. `lib/gps.ts` asks once, with `{ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }`.
   It **never rejects** — every outcome is a value: `{ ok: true, lat, lon, accuracy_m }`, or
   `{ ok: false, code: 'timeout' | 'denied' | 'unavailable' | 'unsupported' }`. A caller that
   had to `catch` is a caller that would eventually send `lat: 0`.
2. A fix renders `±<accuracy_m> m` and the coordinate rounded to **3 decimals**
   (`PUBLIC_COORD_DECIMALS`) — the only precision any surface shows.
3. No fix renders the panel: *Location unavailable in this webview — disclosed on the
   receipt*, the chip **`GPS unavailable in webview — disclosed`**, a ghost `I am at the
   place`, and `Retry location` beside it. The chip is up before the worker taps anything.
4. `POST /proofs` then carries `gps_unavailable=true` and `worker_confirmed_at_place=true`
   and **no `lat`/`lon` field at all** — not an empty one, not a zero. `POST /tasks/:id/submit`
   carries `gps: null` beside the same two flags, which is the invariant the proof schemas
   enforce: `gps === null` ⇔ `gps_unavailable === true`, and a downgraded proof needs the
   worker's confirmation. The API drops the observation's confidence to 0.6 and skips the
   geofence rather than failing it.

**A photo is required on both paths. A location never is.** The location is never faked.

## The photo

`<input type="file" accept="image/*" capture="environment">` — the rear camera, no gallery by
default. On change the file goes through `reencodeImage`, which draws it into a canvas and
asks for a fresh JPEG. Three things fall out of that one round trip: EXIF (and with it the
exact coordinate and the device serial) is gone, the upload lands well under Vercel's 4.5 MB
body limit, and the format is a JPEG rather than whatever the camera app produced. The hash
the escrow anchors is the keccak of exactly these bytes.

Two copy lines sit directly under the capture button, 16 px, and stay there until the proof is
handed in — never behind a step:

> you are paid for the proof, not the answer — 'closed' pays the same as 'open'

> don't photograph people

## The submit body

`POST /proofs` (multipart) answers `{proofHash, url, captured_at}`, and `captured_at` is the
**server's** timestamp — the phone's clock never reaches the receipt.

`POST /tasks/:id/submit` then sends one flat body: `proofHash`, `answer`, an optional `note`
(≤ `NOTE_MAX_CHARS`), and the per-type proof fields exactly as `packages/shared` defines them.
The photo hash goes in **twice under two names** — `proofHash`, which the route schema takes,
and `photo_hash`, which `VerifyOpenProof` / `PhotoOfProof` name — and the API rejects the
submission unless they are the same value (T-33 §13, `apps/api/app/tasks/[id]/submit`).

`call-confirm` has no `template_id` on any surface the worker's phone can reach, so §13's
written fallback applies: after `I called`, a picker over the **six rendered questions** in
`CALL_CONFIRM_TEMPLATES` names the question, and that template's own answer enum follows —
`price` and `time` answers each open the one extra field their schema requires. The whole block
is labelled `self-reported answer + timestamp (unverified)`, because no webview reads a call
log. `compare-two` is a plain toggle plus a required reason here; the two-image view is T-42.

## Never a release without the proof

`PaidState` renders **nothing** when `proofThumbnailUrl` is `null`. The photo is an `img`
above the money inside the same card, in DOM order — not a layout promise. The figure is
`amount_usdc` from `GET /tasks/:id`, printed as it arrived and never computed: the agent pays
3.45, escrow locks 3.45, the worker receives the posted **3.00**, and the 0.45 fee rides on
top rather than coming out. There is no subtraction anywhere on this screen.

After a `submitted` response the screen long-polls `GET /tasks/:id?wait=50` until the row is
terminal, and says plainly what it landed on. `disputed` at submit time reads *"Submitted, but
flagged: &lt;reason&gt;. The operator will resolve it — nothing has been paid yet."* A refund
says nothing was paid out. None of them is red, and none of them shows a figure.

## `/earnings` — earned only

`GET /me/earnings` sums `TaskReleased` to this worker, and every figure on the page is one it
returned: the big numeral, `completed <n> · score <s> · distinct raters <r>`, and nothing else.
No seeded balance, no seeded score, no completion count the account did not do, and nothing
projected from what a shift "could" pay — the line under the tally says so. A fresh account
reads `0.00`, and that zero is the honest answer. The unit is stated twice, as `testnet USDC`
beside the numeral and as a `not spendable` chip beside that.

The payout address is read from `localStorage` by `getPayoutAddress()` and linked to Basescan.
The private key is never read on this screen; backing it up is T-24's screen on `/`.

## Tests

`tests/proof/`, six named cases from §8: `downgradePathSubmits`, `paidStateRequiresProofAbove`,
`earningsEarnedOnly`, `copyLinesPresent`, `gpsTimeoutIsTenSeconds`, `amountNeverDeducted`.

`harness.ts` holds what jsdom does not give you: a camera file, a canvas that encodes, a
`navigator.geolocation` that either answers or fails with a named code, and — the one that
matters — three readers on `Blob.prototype`. jsdom's `Blob` implements only `slice`, `size`
and `type`, so a `FormData` carrying one hangs forever when `fetch` tries to serialize it,
which is the entire multipart upload. `arrayBuffer` / `text` / `stream` over `FileReader` make
the real code path reachable; a browser has had all three for years.

The `POST /proofs` and `POST /tasks/:id/submit` handlers are overridden with msw for the
length of a test to **keep the request**, and they answer with the same fixture bodies
`mocks/handlers.ts` serves. The network is msw and nothing else.
