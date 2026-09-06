# The optional screens — `compare-two`, `Report task`, the unverified state

Three screens the architecture marks "optional if ahead". They share no code with each other;
what they share is that each one is finished rather than sketched, because the first of them
is the type a judge can complete live at the finals table without leaving the room.

## `compare-two` is the travel-free type

`/compare/<task_id>` asks nothing of where the worker is standing. It opens no camera, reads
no location, calls `POST /proofs` never, and sends no `proofHash` — the submit route makes
that field optional, and for this type there is nothing to hash a photograph of. The whole
submission is `{ answer, choice, reason }`, validated against `CompareTwoProof` from
`packages/shared` before it leaves the phone.

The copy under the pair says both halves of that out loud, before any tap:

- `you are paid for the judgement, not for a particular answer — 'neither' pays the same as 'a'`
- `no travel, no camera, no location for this task`

`neither` is a first-class answer, not a failure, and nothing is preselected: `SUBMIT` stays
disabled until a human has chosen a side *and* written one line.

**No faces.** The pair is the agent's own evidence, and the agent is the one who chose the two
images. If either of them contains a person, the worker picks `neither` and writes
`shows a person` as the reason. The screen does not say this — telling a worker on the phone
what to write is how you get that sentence back whether or not it is true — but a reviewer
reading this file should know it is the intended path, and that the worker is paid for it the
same as for `a` or `b`.

**The receipt is the judgement.** `ComparePaidState` renders nothing at all without a choice,
and when it renders, the pair and the reason are above the amount. T-33's `PaidState` needs a
photograph and cannot draw this receipt; this one mirrors its copy so a text pair and a
`neither` still have a proof above the money. The amount is `amount_usdc` from
`GET /tasks/:id`, printed as it arrives — never computed, never a deducted figure.

The spec arrives from `GET /tasks/:id/spec`, which is the one route that shows spec text to a
human and only to the current claimant. A task of any other type redirects to `/proof/<id>`.

## `Report task`: release first, report second

`/report/<task_id>` makes two requests, in this order and never in parallel:

1. `POST /tasks/:id/release-claim` — relayed, no gas, and inside the claim window there is no
   cooldown for giving a task up.
2. `POST /tasks/:id/report` with `{ class }`, one of the six `ABUSE_CLASSES` from
   `packages/shared`, imported rather than re-typed.

If the release fails — a 409, a 5xx, anything — the screen says
`could not release the claim — try again` in amber and **the report is not sent**. Two reasons
for the order. A report that landed first would leave a worker still holding a task they had
just accused. A report that landed after a failed release would be a record against a buyer
with no matching claim behind it.

A report is not a mark. The API escalates to an `AbuseMark` only after operator review, or
when two different verified workers report the same buyer, and the third copy line says so
before the worker taps anything. The tag the API eventually writes is `task-refused`; the word
on the phone is `report`.

The screen shows no money, no buyer or agent identity, and no task spec beyond the title.

## `UnverifiedBanner`: what the caller owes it

`components/UnverifiedBanner.tsx` is pure props. It reads no session, fetches nothing, and
knows no route — so it can be the very first thing a stranger sees without a provider around
it.

```tsx
<UnverifiedBanner
  tasks={open.map((t) => ({
    task_id: t.task_id,
    task_type: t.task_type,
    title: t.title ?? '',
    price_usdc: t.amount_usdc,   // the worker's rate; the agent's price never reaches the phone
    seeded: t.seeded,            // rule (9): pass it through, it renders the chip
  }))}
  verifyHref="/"
/>
```

Mounted by the lead after #102: `app/tasks/page.tsx` renders `app/tasks/UnverifiedTasks.tsx`
when the session probe has settled without a session, fed with the open rows of
`GET /public/feed` (`price_usdc` is already the worker's rate there, and a row with no title is
titled `<type> · <area>`). The proof header carries the `Report task` link. The
banner goes first, above the rows: the offer is readable at real prices, and every row's
button is disabled and says so in ARIA.

Zero rows renders `no open tasks right now` under the banner rather than an empty page.

## Two notes on the primitives

T-24's `Button` takes no ARIA props and renders no anchor, so three controls here use its
classes on the right element instead of restyling it — the locked row buttons
(`disabled` + `aria-disabled="true"`), the segmented `A | B | Neither` (`aria-pressed`), and
the link-shaped `Back to tasks` / `Verify with World ID`. T-33 makes the same move for its own
segmented control and its `Back to tasks` link; nothing about the primitive changes.

The reason field caps at `NOTE_MAX_CHARS` twice over: `maxLength` on the textarea, and a
`slice` in the change handler. The attribute stops typing and a paste, but a webview autofill
can hand a field a longer string than either, and the schema would reject it after the claim
had already been spent.
