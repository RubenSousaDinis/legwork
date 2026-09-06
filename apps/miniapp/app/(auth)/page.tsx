'use client';

import type { RpContext } from '@worldcoin/idkit-core';
import { MiniKit } from '@worldcoin/minikit-js';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Chip } from '../../components/ui/Chip';
import { ApiError } from '../../lib/api';
import { resolveArea } from '../../lib/area';
import { CREDENTIAL_LEVEL } from '../../lib/env';
import {
  createIdkitSession,
  createWalletAuthSession,
  setSessionState,
  useSession,
} from '../../lib/session';
import { loadOrCreatePayoutKey } from '../../lib/workerKey';
import { requestRpContext, type VerifyResponse } from '../../lib/worldid';
import { Landing } from './Landing';
import { PayoutKeyStep } from './PayoutKeyStep';
import { RegisterStep } from './RegisterStep';
import { registerWorker } from './register';
import { SignInStep } from './SignInStep';
import { VerifyStep } from './VerifyStep';

/**
 * The worker's first minute: verify once with World ID, sign in, get a payout address,
 * register — then `/tasks` opens. A worker who already has a session skips all of it.
 */

type Step = 'landing' | 'verifying' | 'signing-in' | 'payout-key' | 'register';

const CONFLICT_MESSAGE =
  'This World ID already has a worker account. Restore it with your payout key below.';

/** Long enough to read the transaction chip, short enough that nobody taps twice. */
const REDIRECT_DELAY_MS = 2500;

function describe(error: unknown): string {
  if (error instanceof ApiError) {
    const body = error.body as { error?: string } | null;
    return body?.error ? `${error.status} ${body.error}` : `api ${error.status}`;
  }
  return error instanceof Error ? error.message : String(error);
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
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [mode, setMode] = useState<'walletAuth' | 'idkit' | null>(null);
  const [payoutAddress, setPayoutAddress] = useState<string | null>(null);
  const [tx, setTx] = useState<string | null>(null);

  const verified = useRef<VerifyResponse | null>(null);

  // A restored session means the worker is already registered; the task list is where they go.
  useEffect(() => {
    if (session.status === 'verified' && session.registered) router.replace('/tasks');
  }, [session, router]);

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
      setError(describe(thrown));
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
      // One person, one worker account: the way back in is the payout key, not a second World ID.
      setConflict(true);
      setPayoutAddress(loadOrCreatePayoutKey().address);
      setSessionState({ status: 'unverified' });
      setStep('payout-key');
      return;
    }
    setError(describe(thrown));
    setSessionState({ status: 'unverified' });
    setStep('landing');
  }, []);

  const onVerified = useCallback(async (response: VerifyResponse) => {
    verified.current = response;
    setWidgetOpen(false);
    setBusy(true);
    setStep('signing-in');

    const installed = miniKitInstalled();
    const sessionMode = installed ? ('walletAuth' as const) : ('idkit' as const);
    setMode(sessionMode);

    // The payout key exists before sign-in because idkit mode is identified by its address.
    const { address } = loadOrCreatePayoutKey();
    setPayoutAddress(address);

    try {
      const created = installed
        ? await createWalletAuthSession()
        : await createIdkitSession(address);
      setSessionState({
        status: 'verified',
        nullifier: response.nullifier,
        level: response.level,
        mode: sessionMode,
        worker: created.worker,
        registered: false,
      });
      setStep('payout-key');
    } catch (thrown) {
      setError(describe(thrown));
      setSessionState({ status: 'unverified' });
      setStep('landing');
    } finally {
      setBusy(false);
    }
  }, []);

  const register = useCallback(async () => {
    if (payoutAddress === null) return;
    setBusy(true);
    setError(null);
    setStep('register');
    try {
      const area = await resolveArea();
      const result = await registerWorker(payoutAddress, area);
      setTx(result.tx);
      const response = verified.current;
      setSessionState({
        status: 'verified',
        nullifier: response?.nullifier ?? '',
        level: response?.level ?? CREDENTIAL_LEVEL,
        mode: mode ?? 'idkit',
        worker: result.worker,
        registered: true,
      });
      setTimeout(() => router.replace('/tasks'), REDIRECT_DELAY_MS);
    } catch (thrown) {
      setError(describe(thrown));
      setStep('payout-key');
    } finally {
      setBusy(false);
    }
  }, [payoutAddress, mode, router]);

  return (
    <div data-auth-step={step}>
      {conflict ? (
        <p className="lw-error" data-conflict="nullifier_already_registered" data-floor="20">
          {CONFLICT_MESSAGE}
        </p>
      ) : null}
      {error === null ? null : <p className="lw-error">{error}</p>}

      {mode === 'idkit' ? (
        <Chip tone="neutral" floor={20}>
          web sign-in — outside World App
        </Chip>
      ) : null}

      {step === 'landing' ? (
        <Landing busy={busy} level={CREDENTIAL_LEVEL} onVerify={startVerify} state={session} />
      ) : null}

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
          busy={busy}
          importOpen={conflict}
          onContinue={register}
          onImported={setPayoutAddress}
        />
      ) : null}

      {step === 'register' ? <RegisterStep tx={tx} /> : null}
    </div>
  );
}
