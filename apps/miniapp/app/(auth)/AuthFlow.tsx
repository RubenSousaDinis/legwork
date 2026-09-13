'use client';

import type { RpContext } from '@worldcoin/idkit-core';
import { MiniKit } from '@worldcoin/minikit-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { ApiError } from '../../lib/api';
import {
  lastAreaSource,
  rememberRegisteredArea,
  resolveArea,
  type AreaSource,
} from '../../lib/area';
import { SELFIE } from '@legwork/shared';
import { CREDENTIAL_LEVEL, type CredentialLevel } from '../../lib/env';
import {
  createIdkitSession,
  createWalletAuthSession,
  setSessionState,
  useSession,
  walletAddress,
  type SessionResponse,
} from '../../lib/session';
import { loadOrCreatePayoutKey } from '../../lib/workerKey';
import {
  IdkitFailure,
  isCredentialLevel,
  isIdkitEnvironment,
  rememberIdkitEnvironment,
  rememberedIdkitEnvironment,
  requestRpContext,
  summarizeDebugReport,
  type IdkitEnvironment,
  type VerifyResponse,
} from '../../lib/worldid';
import { describeIdkitError, IDKIT_FALLBACK_SENTENCE, type IdkitErrorDescription } from './idkitErrors';
import { Landing } from './Landing';
import { PayoutKeyStep } from './PayoutKeyStep';
import { RegisterStep } from './RegisterStep';
import { registerWorker } from './register';
import { SignInStep } from './SignInStep';
import { VerifyStep } from './VerifyStep';

/**
 * The worker's first minute: verify once with World ID, sign in, get a payout address,
 * register. The host decides what "done" means — `/verify` goes to `/tasks`, the login
 * modal just closes.
 */

type Step = 'landing' | 'verifying' | 'signing-in' | 'payout-key' | 'register';

const CONFLICT_MESSAGE =
  'This World ID already has a worker account. Sign in with your World App wallet to continue.';

const BROWSER_CONFLICT_MESSAGE =
  'Open this in World App to sign in with the key this phone holds, or paste the key you exported.';

const MISMATCH_MESSAGE =
  'That account is bound to a different payout address.';

/** Long enough to read the transaction chip, short enough that nobody taps twice. */
const REDIRECT_DELAY_MS = 2500;

export const RETRY_WITH_WORLD_APP = 'Retry with World App';

/** Login takes either credential; this is the manual way across when the automatic one is wrong. */
export const RETRY_WITH_ORB = 'Verify with Orb instead';

function describe(error: unknown): string {
  if (error instanceof ApiError) {
    const body = error.body as { error?: string; reason?: string } | null;
    const head = body?.error ? `${error.status} ${body.error}` : `api ${error.status}`;
    return typeof body?.reason === 'string' && body.reason.length > 0
      ? `${head} · ${body.reason}`
      : head;
  }
  if (error instanceof IdkitFailure) {
    // The code alone is what the first phone run showed; the report says why.
    const detail = summarizeDebugReport(error.report);
    return detail === '' ? error.code : `${error.code} · ${detail}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/** A sentence, the raw code, and — when the widget sent one — the SDK's debug report. */
type ScreenError = IdkitErrorDescription & { detail?: string };

/**
 * What the screen says about a failure.
 *
 * A widget code becomes a plain sentence with the code beside it, because a bare
 * `verification_disabled` is not something a worker can act on and not something the
 * operator can read out of a photograph of a phone. An API failure has no such code, so it
 * keeps `describe()`'s text and puts the status in the chip.
 */
function screenError(thrown: unknown): ScreenError {
  if (thrown instanceof IdkitFailure) {
    return { ...describeIdkitError(thrown.code), detail: summarizeDebugReport(thrown.report) };
  }
  if (thrown instanceof ApiError) {
    const body = thrown.body as { reason?: string; detail?: string } | null;
    const code =
      typeof body?.reason === 'string' && body.reason.length > 0 ? body.reason : String(thrown.status);
    const mapped = describeIdkitError(code);
    return {
      sentence: mapped.sentence === IDKIT_FALLBACK_SENTENCE ? describe(thrown) : mapped.sentence,
      code,
      detail: typeof body?.detail === 'string' ? body.detail : undefined,
    };
  }
  // A widget code arrives as `Error(code)` when the SDK carried no report with it.
  return describeIdkitError(describe(thrown));
}

function isMismatchedAddress(thrown: unknown): thrown is ApiError {
  if (!(thrown instanceof ApiError)) return false;
  const body = thrown.body as { error?: string; reason?: string } | null;
  return thrown.status === 403 && body?.reason === 'not_registered';
}

/** Read at sign-in time, not at mount: the webview installs MiniKit asynchronously. */
function miniKitInstalled(): boolean {
  try {
    return MiniKit.isInstalled();
  } catch {
    return false;
  }
}

function widgetErrorCode(thrown: unknown): string {
  if (thrown instanceof IdkitFailure) return thrown.code;
  if (thrown instanceof Error) return thrown.message;
  return '';
}

function closedTheWidget(thrown: unknown): boolean {
  const code = widgetErrorCode(thrown);
  return code === 'user_rejected' || code === 'verification_rejected' || code === 'cancelled';
}

/**
 * The codes that mean "this World ID has no face credential" rather than "not this person".
 * Orb is the other credential `POST /idkit/verify` accepts at login, so these switch over on
 * their own. `verification_disabled` is deliberately not here: that one is the app's own
 * Portal configuration, and its sentence is the only thing that tells the operator so — it
 * keeps the screen and offers the switch as a tap.
 */
const NO_SELFIE_CREDENTIAL = new Set([
  'credential_unavailable',
  'world_id_4_not_available',
  'world_id_3_not_available',
]);

/**
 * Codes where offering Orb is an answer. A registration or session failure is not one of
 * them: `403 not_registered` has nothing to do with which credential was presented, and
 * offering to verify again sends a worker who is already registered back to the start.
 */
export function isCredentialFailure(code: string): boolean {
  return NO_SELFIE_CREDENTIAL.has(code) || code === 'verification_disabled';
}

export function noSelfieCredential(thrown: unknown): boolean {
  if (thrown instanceof ApiError) {
    const body = thrown.body as { reason?: string } | null;
    return typeof body?.reason === 'string' && NO_SELFIE_CREDENTIAL.has(body.reason);
  }
  return NO_SELFIE_CREDENTIAL.has(widgetErrorCode(thrown));
}

/**
 * A widget-level failure must leave IDKit mounted. Closing `open` resets the flow, and
 * bouncing to landing unmounts the portal — that is what made `generic_error` look like
 * the QR never opened. An API refusal (the proof came back; we said no) still closes it.
 */
function keepIdkitOpen(thrown: unknown): boolean {
  if (thrown instanceof ApiError) return false;
  return !closedTheWidget(thrown);
}

/**
 * `POST /register` failed because this human is already bound to this address.
 *
 * Not a failure to recover from by registering again: the registry is already in the state
 * the flow wanted. The session mint is the only step left, so the flow falls through to it.
 */
function alreadyRegistered(thrown: unknown): boolean {
  if (!(thrown instanceof ApiError)) return false;
  const body = thrown.body as { error?: string } | null;
  return (
    thrown.status === 409 &&
    (body?.error === 'worker_already_bound' || body?.error === 'nullifier_already_registered')
  );
}

/** `POST /session` saying the registry has never heard of this worker. */
function notRegisteredYet(thrown: unknown): boolean {
  if (!(thrown instanceof ApiError)) return false;
  const body = thrown.body as { reason?: string } | null;
  return thrown.status === 403 && body?.reason === 'not_registered';
}

const SESSION_RETRY_MS = [600, 1200, 2000, 3000, 4000, 5000] as const;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Mint the worker session, retrying while the chain read lags its own receipt.
 *
 * `POST /register` returns once the registry write is mined, but `POST /session` then asks
 * `isWorker` through an RPC node that has not necessarily caught up — and answers `403
 * forbidden {reason: 'not_registered'}` about a worker it wrote seconds ago. A worker who hit
 * that was registered on chain and on the board's own database, and still could not get in.
 * Only `not_registered` is retried; every other refusal is real and is thrown at once.
 */
async function mintWorkerSession(
  address: string,
  sessionMode: 'walletAuth' | 'idkit',
): Promise<SessionResponse> {
  const mint = () =>
    sessionMode === 'walletAuth' ? createWalletAuthSession() : createIdkitSession(address);
  for (const wait of SESSION_RETRY_MS) {
    try {
      return await mint();
    } catch (thrown) {
      if (!notRegisteredYet(thrown)) throw thrown;
      await sleep(wait);
    }
  }
  return mint();
}

/**
 * The address this World ID is already bound to, when `POST /idkit/verify` says so.
 *
 * The 409 carries the worker it conflicts with, and the idkit cookie that mints a session for
 * exactly that address — so a returning human signs in instead of being told to go away.
 */
export function isNullifierConflict(thrown: unknown): boolean {
  if (!(thrown instanceof ApiError) || thrown.status !== 409) return false;
  return (thrown.body as { error?: string } | null)?.error === 'nullifier_already_registered';
}

export function alreadyRegisteredWorker(thrown: unknown): string | null {
  if (!isNullifierConflict(thrown)) return null;
  const body = (thrown as ApiError).body as { worker?: unknown } | null;
  return typeof body?.worker === 'string' && body.worker.length > 0 ? body.worker : null;
}

export type AuthFlowProps = {
  onDone: () => void;
};

export function AuthFlow({ onDone }: AuthFlowProps) {
  const session = useSession();
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const [step, setStep] = useState<Step>('landing');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ScreenError | null>(null);
  const [conflict, setConflict] = useState(false);
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [mode, setMode] = useState<'walletAuth' | 'idkit' | null>(null);
  const [payoutAddress, setPayoutAddress] = useState<string | null>(null);
  const [tx, setTx] = useState<string | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [areaSource, setAreaSource] = useState<AreaSource>('default');
  const [idkitEnvironment, setIdkitEnvironment] = useState<IdkitEnvironment>(rememberedIdkitEnvironment);
  // Login accepts either credential — `POST /idkit/verify` takes Orb and Selfie Check alike.
  // Selfie Check is asked for first; Orb is the fallback when this World ID has no face
  // credential, or the app has Selfie Check switched off in this environment.
  const [credential, setCredential] = useState<CredentialLevel>(SELFIE);

  const verified = useRef<VerifyResponse | null>(null);

  // A restored session means the worker is already registered; the host is where they go.
  useEffect(() => {
    if (session.status === 'verified' && session.registered) onDoneRef.current();
  }, [session]);

  const refreshArea = useCallback(async () => {
    const resolved = await resolveArea();
    setArea(resolved);
    setAreaSource(lastAreaSource());
  }, []);

  useEffect(() => {
    if (step !== 'payout-key' || conflict) return;
    void refreshArea();
  }, [step, conflict, refreshArea]);

  /**
   * An options object, not positional arguments. `onClick={startVerify}` hands this a click
   * event, and a click event read as `environment` is what IDKit's allocator crashes on —
   * an object whose two keys are both guarded below cannot be misread that way.
   */
  const startVerify = useCallback(
    async (next?: { environment?: IdkitEnvironment; credential?: CredentialLevel }) => {
      const environment = isIdkitEnvironment(next?.environment)
        ? next.environment
        : idkitEnvironment;
      const nextCredential = isCredentialLevel(next?.credential) ? next.credential : credential;
      rememberIdkitEnvironment(environment);
      setIdkitEnvironment(environment);
      setCredential(nextCredential);
      setBusy(true);
      setError(null);
      setConflict(false);
      verified.current = null;
      setSessionState({ status: 'verifying' });
      setStep('verifying');
      try {
        const { rp_context } = await requestRpContext();
        setRpContext(rp_context);
        setWidgetOpen(true);
      } catch (thrown) {
        setError(screenError(thrown));
        setSessionState({ status: 'unverified' });
        setStep('landing');
      } finally {
        setBusy(false);
      }
    },
    [idkitEnvironment, credential],
  );

  const onFailed = useCallback((thrown: unknown) => {
    // A 409 that names no worker is one this client cannot sign in for — an older API, or a
    // binding the registry has and the row does not. The conflict screen is still the answer.
    if (isNullifierConflict(thrown) && alreadyRegisteredWorker(thrown) === null) {
      setWidgetOpen(false);
      void (async () => {
        setConflict(true);
        if (miniKitInstalled()) {
          setMode('walletAuth');
          setPayoutAddress(await walletAddress());
        } else {
          setPayoutAddress(loadOrCreatePayoutKey().address);
        }
        setSessionState({ status: 'unverified' });
        setStep('payout-key');
      })();
      return;
    }

    const boundWorker = alreadyRegisteredWorker(thrown);
    if (boundWorker !== null) {
      // A returning worker, not a refusal. The proof just presented is what `POST
      // /idkit/verify` answers the 409 with a cookie for, so signing in is one call — the
      // wallet inside World App, the bound address outside it. The conflict screen is only
      // reached if that fails, which now means a genuinely different account.
      setWidgetOpen(false);
      void (async () => {
        const sessionMode = miniKitInstalled() ? ('walletAuth' as const) : ('idkit' as const);
        setMode(sessionMode);
        setStep('signing-in');
        try {
          // Not `mintWorkerSession`: its retry exists for the read lag right after a write,
          // and there is no write here. On this path `403 not_registered` is permanent — the
          // wallet on this phone is not the worker this World ID is bound to — so retrying it
          // would spend sixteen seconds before saying so.
          const created =
            sessionMode === 'walletAuth'
              ? await createWalletAuthSession()
              : await createIdkitSession(boundWorker);
          setPayoutAddress(created.worker);
          setSessionState({
            status: 'verified',
            nullifier: created.nullifier,
            level: verified.current?.level ?? CREDENTIAL_LEVEL,
            mode: sessionMode,
            worker: created.worker,
            registered: true,
          });
          onDoneRef.current();
          return;
        } catch (signIn) {
          setError(
            isMismatchedAddress(signIn)
              ? { sentence: MISMATCH_MESSAGE, code: String(signIn.status) }
              : screenError(signIn),
          );
        }
        setConflict(true);
        if (sessionMode === 'walletAuth') {
          setPayoutAddress(await walletAddress());
        } else {
          setPayoutAddress(loadOrCreatePayoutKey().address);
        }
        setSessionState({ status: 'unverified' });
        setStep('payout-key');
      })();
      return;
    }

    // This World ID has no face credential, or the app has Selfie Check switched off here.
    // Orb is the other credential login accepts, so ask for that one instead of stopping.
    if (credential === SELFIE && noSelfieCredential(thrown)) {
      setWidgetOpen(false);
      void startVerify({ credential: 'orb' });
      return;
    }

    setError(screenError(thrown));
    setSessionState({ status: 'unverified' });
    if (keepIdkitOpen(thrown)) return;
    setWidgetOpen(false);
    setStep('landing');
  }, [credential, startVerify]);

  const onWidgetOpenChange = useCallback((open: boolean) => {
    setWidgetOpen(open);
    // Success already moved the step; closing the portal must not send them back to landing.
    if (open || verified.current) return;
    setStep((current) => (current === 'verifying' ? 'landing' : current));
  }, []);

  /**
   * Registration, given an address. Split out of `register` so `onVerified` can call it with
   * the address it just derived — state set in the same tick is not readable here.
   */
  const registerWith = useCallback(async (address: string, sessionMode: 'walletAuth' | 'idkit') => {
    setBusy(true);
    setError(null);
    setStep('register');
    try {
      const area = await resolveArea();
      rememberRegisteredArea(area);
      // Recorded so the confirmation can name the cell: it is written on chain and there is
      // no route that changes it afterwards, so it has to be said at least once.
      setArea(area);
      setAreaSource(lastAreaSource());
      try {
        const result = await registerWorker(address, area);
        setTx(result.tx);
      } catch (thrown) {
        // A retry after the session mint failed comes back through here with the registration
        // already done. Re-registering is what the registry refuses; the session is what is
        // actually missing, so carry on to it.
        if (!alreadyRegistered(thrown)) throw thrown;
      }

      // Now, and not before: the registry knows this address, so `POST /session` will issue the
      // worker-session cookie every other route reads. Inside World App that is a walletAuth
      // signature; outside it the payout address is the identity.
      const created = await mintWorkerSession(address, sessionMode);

      const response = verified.current;
      setSessionState({
        status: 'verified',
        nullifier: response?.nullifier ?? created.nullifier,
        level: response?.level ?? CREDENTIAL_LEVEL,
        mode: sessionMode,
        worker: created.worker,
        registered: true,
      });
      setTimeout(() => onDone(), REDIRECT_DELAY_MS);
    } catch (thrown) {
      setError(screenError(thrown));
      // The payout screen is where a failed registration can be retried, and where the web
      // path's key controls live — so a failure is the one time it is worth showing.
      setStep('payout-key');
    } finally {
      setBusy(false);
    }
  }, [onDone]);

  const onVerified = useCallback((response: VerifyResponse) => {
    verified.current = response;
    setError(null);
    setWidgetOpen(false);

    const sessionMode = miniKitInstalled() ? ('walletAuth' as const) : ('idkit' as const);
    setMode(sessionMode);

    void (async () => {
      // Inside World App the wallet is the worker; on the web the generated payout key is.
      const address =
        sessionMode === 'walletAuth' ? await walletAddress() : loadOrCreatePayoutKey().address;
      if (address === null) {
        setError({
          sentence: 'World App did not return a wallet address.',
          code: 'wallet',
        });
        setSessionState({ status: 'unverified' });
        setStep('landing');
        return;
      }
      setPayoutAddress(address);

      // No session yet, on purpose. `POST /session` refuses a worker the registry does not know
      // — `403 forbidden {reason: 'not_registered'}` in both modes — and a human who has just
      // verified is exactly that. The session is created after `POST /register` returns, which
      // is what makes them a worker; until then the idkit-session cookie from `POST
      // /idkit/verify` is the only credential this flow needs, and it is what `/register` reads.
      setSessionState({
        status: 'verified',
        nullifier: response.nullifier,
        level: response.level,
        mode: sessionMode,
        worker: address,
        registered: false,
      });

      // Straight into the chain write. Nothing on the payout screen was a question for a
      // first-time worker: the address is derived, not chosen; the area comes from
      // `resolveArea()` here exactly as it did there; and a returning worker never reaches
      // this path — a bound nullifier is the 409 above, which opens the import box instead.
      await registerWith(address, sessionMode);
    })();
  }, [registerWith]);

  /** The retry button on the payout screen, after a registration that failed. */
  const register = useCallback(() => {
    if (payoutAddress === null) return;
    void registerWith(payoutAddress, mode ?? (miniKitInstalled() ? 'walletAuth' : 'idkit'));
  }, [payoutAddress, mode, registerWith]);

  const signInExisting = useCallback(async () => {
    if (!miniKitInstalled()) return;
    setBusy(true);
    setError(null);
    try {
      setMode('walletAuth');
      const created = await createWalletAuthSession();
      setSessionState({
        status: 'verified',
        nullifier: created.nullifier,
        level: CREDENTIAL_LEVEL,
        mode: 'walletAuth',
        worker: created.worker,
        registered: true,
      });
      onDone();
    } catch (thrown) {
      if (isMismatchedAddress(thrown)) {
        setError({ sentence: MISMATCH_MESSAGE, code: String(thrown.status) });
      } else {
        setError(screenError(thrown));
      }
    } finally {
      setBusy(false);
    }
  }, [onDone]);

  return (
    <div data-auth-step={step}>
      {conflict ? (
        <p className="lw-error-line" data-conflict="nullifier_already_registered" data-floor="20">
          {miniKitInstalled() ? CONFLICT_MESSAGE : BROWSER_CONFLICT_MESSAGE}
        </p>
      ) : null}
      {error === null ? null : (
        <>
          <FailedCheck error={error} />
          {error.code === 'environment_mismatch' && idkitEnvironment !== 'production' ? (
            <p data-floor="20">
              <Button
                variant="ghost"
                onClick={() => void startVerify({ environment: 'production' })}
                disabled={busy}
              >
                {RETRY_WITH_WORLD_APP}
              </Button>
            </p>
          ) : null}
          {credential === SELFIE && isCredentialFailure(error.code) ? (
            <p data-floor="20">
              <Button
                variant="ghost"
                onClick={() => void startVerify({ credential: 'orb' })}
                disabled={busy}
              >
                {RETRY_WITH_ORB}
              </Button>
            </p>
          ) : null}
        </>
      )}

      {mode === 'idkit' ? (
        <Chip tone="neutral" floor={20}>
          web sign-in — outside World App
        </Chip>
      ) : null}

      {step === 'landing' ? (
        <Landing busy={busy} level={credential} onVerify={() => void startVerify()} />
      ) : null}

      {step === 'verifying' ? (
        <VerifyStep
          environment={idkitEnvironment}
          level={credential}
          onFailed={onFailed}
          onOpenChange={onWidgetOpenChange}
          onVerified={onVerified}
          open={widgetOpen}
          rpContext={rpContext}
        />
      ) : null}

      {step === 'signing-in' ? <SignInStep mode={mode} /> : null}

      {step === 'payout-key' && payoutAddress !== null ? (
        <PayoutKeyStep
          address={payoutAddress}
          area={area}
          areaSource={areaSource}
          busy={busy}
          conflict={conflict}
          importOpen={conflict}
          onContinue={register}
          onImported={setPayoutAddress}
          onRetryLocation={() => void refreshArea()}
          onSignIn={miniKitInstalled() ? () => void signInExisting() : undefined}
          wallet={miniKitInstalled()}
        />
      ) : null}

      {step === 'register' ? (
        <RegisterStep
          area={area}
          areaSource={areaSource}
          payoutAddress={mode === 'walletAuth' ? null : payoutAddress}
          tx={tx}
        />
      ) : null}
    </div>
  );
}

/**
 * The failed check: one sentence in body ink, the raw code in a neutral chip beside it, and
 * the SDK's debug report under both when the widget sent one. Not `.lw-error` — amber is the
 * refusal colour, and a World ID that did not answer is not a refusal.
 */
function FailedCheck({ error }: { error: ScreenError }) {
  return (
    <>
      <p className="lw-error-line" data-error="idkit">
        <span>{error.sentence}</span>{' '}
        <Chip tone="neutral">
          <code data-error-code>{error.code}</code>
        </Chip>
      </p>
      {error.detail === undefined || error.detail === '' ? null : (
        <p className="lw-count" data-error-detail>
          {error.detail}
        </p>
      )}
    </>
  );
}
