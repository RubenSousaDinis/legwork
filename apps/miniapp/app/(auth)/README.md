# Auth flow + session modes

`/` is the worker's first minute. One state machine (`page.tsx`) walks five steps and then
hands over to `/tasks`:

```
unverified landing → verifying (IDKit) → sign-in (walletAuth | idkit) → payout key → register → /tasks
```

A worker who already has a session never sees any of it: `useSession()` restores on load and
`page.tsx` redirects when the restored session is `registered`.

## The two session modes

`MiniKit.isInstalled()` is read **at sign-in time**, not at mount — the World App webview
installs MiniKit asynchronously, so a mount-time read says "no" on a phone that is about to
say "yes".

| | inside World App | plain mobile web |
|---|---|---|
| trigger | `MiniKit.isInstalled()` is `true` | it is `false` |
| calls | `GET /session/nonce` → `MiniKit.walletAuth({nonce, statement: 'Sign in to Legwork', expirationTime: now + 10 min})` → `POST /session` | `POST /session` |
| body | `{mode: 'walletAuth', payload: <the walletAuth result's `data` object>, nonce}` | `{mode: 'idkit', worker_address: <payout address>}` |
| disclosure | — | the chip `web sign-in — outside World App`, up for the rest of the flow |

`payload` is the `data` object (`{address, message, signature}`), and the same `nonce` that
`GET /session/nonce` returned goes back beside it so the API can check the SIWE message
against the one it issued.

Both modes end in the same worker-session cookie. Everything goes through the same-origin
`/api` rewrite, which is what keeps that cookie first-party inside the webview — if it ever
stops surviving the rewrite on a phone, that is a `BLOCKED: cookies through rewrite`, not a
reason to switch to cross-origin calls.

## Restoring a session

`restoreSession()` probes `GET /me/earnings`: 200 means the cookie is alive and the worker is
registered, 401 means start over. `localStorage['legwork.session.v1']` holds a **non-secret**
mirror — address, nullifier, level, mode — so the sticky header renders the right chip on the
first paint instead of flashing "Verify to claim" at a verified worker. The mirror is never
the authority; the cookie is.

## The payout key

`lib/workerKey.ts` generates it with viem on the phone and stores it under
`localStorage['legwork.payoutKey.v1']`. The private key is never sent, never logged, and
never in React state for longer than the reveal box is open. Legwork only ever learns the
address, which is what `POST /register` writes onchain. Losing site data loses access to
unpaid earnings — the screen says exactly that, and offers `Import an existing payout key`
as the way back in.

A 409 `nullifier_already_registered` from `POST /idkit/verify` is not an error state: one
person gets one worker account, so the flow jumps straight to the payout-key screen with the
import field already open.

## Area

`resolveArea()` tries `getCurrentPosition` once and falls back to `DEFAULT_AREA` (`ez5ku`,
Leiria). Public surfaces only ever see the geohash-5 cell; the exact fix stays on the phone.

## Registration

`POST /register {worker_address, area, task_types}` — all four task types in v0, no picker.
The relayer signs the attestation and pays the gas, which is why the screen shows the
transaction and the chip `operator-attested`.

## Notes for whoever reviews this

- `lib/worldid.ts` is a `.ts` file, so `IdkitVerify` is built with `createElement` rather than
  JSX. `apps/miniapp/lib/worldid.ts` is the path the brief owns, and `.tsx` is a different path.
- The CTA carries `data-floor="20"` on its wrapper, not on the `<button>`: `.lw-button--lg`
  (T-05, `app/globals.css`) sets `font-size: 17px` at equal specificity and later in the file,
  so the attribute on the button itself would not win. Raising the `lg` button to the 20 px
  narrated floor is a one-line change in a file this task does not own.
