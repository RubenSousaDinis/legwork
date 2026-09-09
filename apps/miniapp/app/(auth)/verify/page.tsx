'use client';

import type { RpContext } from '@worldcoin/idkit-core';
import { MiniKit } from '@worldcoin/minikit-js';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Chip } from '../../../components/ui/Chip';
import { ApiError } from '../../../lib/api';
import {
  lastAreaSource,
  rememberRegisteredArea,
  resolveArea,
  type AreaSource,
} from '../../../lib/area';
import { CREDENTIAL_LEVEL } from '../../../lib/env';
import {
  createIdkitSession,
  createWalletAuthSession,
  setSessionState,
  useSession,
  walletAddress,
} from '../../../lib/session';
import { loadOrCreatePayoutKey } from '../../../lib/workerKey';
import {
  IdkitFailure,
  requestRpContext,
  summarizeDebugReport,
  type VerifyResponse,
} from '../../../lib/worldid';
import { describeIdkitError, type IdkitErrorDescription } from '../idkitErrors';
import { Landing } from '../Landing';
import { PayoutKeyStep } from '../PayoutKeyStep';
import { RegisterStep } from '../RegisterStep';
import { registerWorker } from '../register';
import { SignInStep } from '../SignInStep';
import { VerifyStep } from '../VerifyStep';

/**
 * The worker's first minute: verify once with World ID, sign in, get a payout address,
 * register — then `/tasks` opens. A worker who already has a session skips all of it.
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

function describe(error: unknown): string {
  if (error instanceof ApiError) {
    const body = error.body as { error?: string } | null;
    return body?.error ? `${error.status} ${body.error}` : `api ${error.status}`;
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
    return { sentence: describe(thrown), code: String(thrown.status) };
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

export default function AuthPage() {
  const router = useRouter();
  const session = useSession();

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

  const verified = useRef<VerifyResponse | null>(null);

  // A restored session means the worker is already registered; the task list is where they go.
  useEffect(() => {
    if (session.status === 'verified' && session.registered) router.replace('/tasks');
  }, [session, router]);

  const refreshArea = useCallback(async () => {
    const resolved = await resolveArea();
    setArea(resolved);
    setAreaSource(lastAreaSource());
  }, []);

  useEffect(() => {
    if (step !== 'payout-key' || conflict) return;
    void refreshArea();
  }, [step, conflict, refreshArea]);

  const startVerify = useCallback(async () => {
    setBusy(true);
    setError(null);
    setConflict(false);
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
  }, []);

  const onFailed = useCallback((thrown: unknown) => {
    setWidgetOpen(false);
    if (
      thrown instanceof ApiError &&
      thrown.status === 409 &&
      (thrown.body as { error?: string } | null)?.error === 'nullifier_already_registered'
    ) {
      // One person, one worker account. Inside World App the way back in is the wallet;
      // outside it, the generated payout key.
      void (async () => {
        setConflict(true);
        if (miniKitInstalled()) {
          setMode('walletAuth');
          const wallet = await walletAddress();
          setPayoutAddress(wallet);
        } else {
          setPayoutAddress(loadOrCreatePayoutKey().address);
        }
        setSessionState({ status: 'unverified' });
        setStep('payout-key');
      })();
      return;
    }
    setError(screenError(thrown));
    setSessionState({ status: 'unverified' });
    setStep('landing');
  }, []);

  const onVerified = useCallback((response: VerifyResponse) => {
    verified.current = response;
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
      setStep('payout-key');
    })();
  }, []);

  const register = useCallback(async () => {
    if (payoutAddress === null) return;
    setBusy(true);
    setError(null);
    setStep('register');
    try {
      const area = await resolveArea();
      rememberRegisteredArea(area);
      const result = await registerWorker(payoutAddress, area);
      setTx(result.tx);

      // Now, and not before: the registry knows this address, so `POST /session` will issue the
      // worker-session cookie every other route reads. Inside World App that is a walletAuth
      // signature; outside it the payout address is the identity.
      const sessionMode = mode ?? (miniKitInstalled() ? 'walletAuth' : 'idkit');
      const created =
        sessionMode === 'walletAuth'
          ? await createWalletAuthSession()
          : await createIdkitSession(payoutAddress);

      const response = verified.current;
      setSessionState({
        status: 'verified',
        nullifier: response?.nullifier ?? created.nullifier,
        level: response?.level ?? CREDENTIAL_LEVEL,
        mode: sessionMode,
        worker: created.worker,
        registered: true,
      });
      setTimeout(() => router.replace('/tasks'), REDIRECT_DELAY_MS);
    } catch (thrown) {
      setError(screenError(thrown));
      setStep('payout-key');
    } finally {
      setBusy(false);
    }
  }, [payoutAddress, mode, router]);

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
      router.replace('/tasks');
    } catch (thrown) {
      if (isMismatchedAddress(thrown)) {
        setError({ sentence: MISMATCH_MESSAGE, code: String(thrown.status) });
      } else {
        setError(screenError(thrown));
      }
    } finally {
      setBusy(false);
    }
  }, [router]);

  return (
    <div data-auth-step={step}>
      {conflict ? (
        <p className="lw-error-line" data-conflict="nullifier_already_registered" data-floor="20">
          {miniKitInstalled() ? CONFLICT_MESSAGE : BROWSER_CONFLICT_MESSAGE}
        </p>
      ) : null}
      {error === null ? null : <FailedCheck error={error} />}

      {mode === 'idkit' ? (
        <Chip tone="neutral" floor={20}>
          web sign-in — outside World App
        </Chip>
      ) : null}

      {step === 'landing' ? <Landing busy={busy} onVerify={startVerify} /> : null}

      {step === 'verifying' ? (
        <VerifyStep
          level={CREDENTIAL_LEVEL}
          onFailed={onFailed}
          onOpenChange={setWidgetOpen}
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

      {step === 'register' ? <RegisterStep tx={tx} /> : null}
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
