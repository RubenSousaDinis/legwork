# `/tasks` — the worker's list, and the one claim they can hold

The screen a verified worker lands on after registering. Three files:

| file | what it is |
|---|---|
| `page.tsx` | `requireVerified()`, then `TaskList`. An unverified visitor is sent to `/`. |
| `TaskList.tsx` | the poll, the claim and release calls, the error copy, the footer |
| `activeClaim.ts` | `localStorage['legwork.activeClaim.v1']` — `readActiveClaim` / `writeActiveClaim` / `clearActiveClaim` |

`components/TaskCard.tsx` renders one row in its three states and `components/Countdown.tsx`
is the `mm:ss` clock. Both are used again by T-33.

## The poll

`GET /tasks/list?area=&lat=&lon=` every **3 seconds**. A claim is a race — a row that is gone
needs to disappear before the worker walks to it — and three seconds is what `02-architecture`
asks for.

The path is **`/tasks/list`**, not `/tasks`. `apps/api/app/tasks/route.ts` is POST-only so that
T-16 and T-17 never share a file, so the worker's board is a route of its own; `api-contract.ts`
(`listTasks`), `docs/api.md` and `apps/api/app/tasks/list/route.ts` all agree. The brief's §2
and §5 carried the pre-wave-2 spelling — the route on `main` wins, and the lead is amending
both sections. T-24's mocks answer either path, so nothing but this line changed.

- `area` is `resolveArea()`, the geohash-5 cell and nothing finer. It is resolved once on
  mount and read through a ref, so the interval is built once instead of once per fix.
- `lat`/`lon` ride along only when `lastKnownPosition()` already has a fix, and only so the
  API can sort nearest-first. The exact coordinate never leaves the phone by any other route.
- The interval returns early while `document.hidden`, and a `visibilitychange` or `focus`
  polls immediately rather than waiting out the remaining seconds. A phone in a pocket asks
  for nothing.
- `poll` is wrapped in a `useCallback` with **no dependencies** — the router is read through a
  ref. A `poll` that changed identity would tear down and rebuild the interval on every
  render, and every rebuild is an extra request.
- **401** → `router.replace('/')`. The cookie is the session; there is nothing to retry.

Empty list: `No open tasks near you right now — the list refreshes every 3 s.`

## The claim

`POST /tasks/:id/claim` → `{tx, claim_expires_at, submit_deadline}`, written to
`localStorage['legwork.activeClaim.v1']` and pinned at the top of the list with:

- a `Countdown` to `claim_expires_at`,
- the transaction, short-form and linked (`tx 0x8f2a…c41d ↗` → Basescan),
- the chip `relayed claim · gas paid by Legwork` — the worker never pays gas, and the screen
  says so rather than leaving it to be inferred,
- `Go to proof` → `/proof/<task_id>` (T-33) and `release this claim`.

Releasing calls `POST /tasks/:id/release-claim`, clears the stored claim and polls again. It is
free inside the TTL; the cooldown below is what stops a worker claiming and vanishing in a loop.

### Expiry

The countdown's `onExpire` fires **inside `TaskCard`**, which clears the stored claim and swaps
the actions for `claim expired — it returned to the pool`. It is done there, not through a
prop, because `localStorage` is the one thing the card and the list both read: the next poll
sees `readActiveClaim()` return `null`, un-pins the card, and the task is back on the list like
any other open row — at most three seconds later.

`ClaimedActions` resets its clock **during render** rather than in an effect. `Countdown` is a
child, so its effects run first; a claim already past its deadline would have its `onExpire`
undone by a parent effect firing afterwards.

## Error copy

Rendered inline under the button, 16 px, in ink. **Never red, and never amber** — amber is the
refusal colour on every Legwork surface, and losing a race for a task is not a refusal.

| answer | copy |
|---|---|
| `InCooldown` | `You released or let a claim expire recently. You can claim again within 15 min.` (`CLAIM_COOLDOWN_S`) |
| `AlreadyClaimed` | `Someone claimed this task first.` — and an immediate re-poll, because the list is already wrong |
| `SeededCannotClaimExternal` | `This account is a seeded demo worker; it can only claim operator-funded tasks.` |

Mapped on the **error code**, not the status: `api-contract.ts` allows both 403 and 409 for
this route, and T-24's mocks answer `SeededCannotClaimExternal` with 403.

## What the card shows

Price is `price_usdc` — the posted rate the worker keeps, 3.00. The agent pays 3.45, escrow
locks 3.45 and the fee is 0.45 on top; no deducted figure appears anywhere on this screen.
Every seeded row carries the chip `seeded`.

Distance is rounded to the nearest **10 m** and written `~180 m` at street scale, `~1.2 km`
(one decimal) beyond a kilometre, and `—` when the API sends none. Ten metres is as fine as
this screen ever gets: it is a "how far do I walk" figure, not a position. The TTL line is
`claim within 30 min`, from `DEFAULT_CLAIM_TTL_S`.

The address is the row's `title` — the API renders it as `<place> · <street>, <locality>` — and
the question line is derived from `task_type`, because that line is the same for every task of
its type.

Under it, `BriefDetail` renders the one thing that differs, when the row's `brief` carries it:

| type | rendered | marker |
|---|---|---|
| `verify-open` | nothing more — "Is it open right now?" is the whole question | — |
| `photo-of` | `subject`, joined to `subject_detail` with `—` when that is present | `[data-brief="subject"]` |
| `call-confirm` | `template_question` | `[data-brief="template_question"]` |
| `compare-two` | `criterion_id`, as a `MonoTag` | `[data-brief="criterion_id"]` |

A row whose `brief` is absent, or which carries only fields this card does not render, shows
the type-derived copy and nothing else. `place`, `phone` and `slots` are on the wire and are
deliberately not rendered here: the address is already the `title`, and the rest belongs to
the proof screen after the claim.

## Phone floors

Every `button` and `a` carries `data-hit="44"`. Narrated elements — the price, `CLAIM`, the
countdown, the claimed card's title and every chip — carry `data-floor="20"`.

`CLAIM` carries it on its wrapper rather than on the `<button>`: `.lw-button--lg` sets
`font-size: 17px` at equal specificity and later in `globals.css`, so the attribute on the
button itself would not win. That is the same shape T-24's landing CTA uses, and raising the
`lg` button to the narrated floor is a one-line change in a file this task does not own.

## Footer

`earnings 0.00 testnet USDC` + the chip `not spendable`, linking to `/earnings` (T-33). The
figure is `GET /me/earnings` → `released_usdc` and nothing else — earned-only, never a
projection or a pending total — read once a minute rather than on the 3-second poll.
