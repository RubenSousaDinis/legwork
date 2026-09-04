'use client';

import { IDKitRequestWidget, type IDKitResult } from '@worldcoin/idkit';
import { MiniKit } from '@worldcoin/minikit-js';
import type { RpContext } from '@worldcoin/idkit-core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMiniKit } from '../../components/MiniKitProvider';
import { ApiError } from '../../lib/api';
import { CREDENTIAL_LEVEL, WORLD_ACTION, WORLD_APP_ID } from '../../lib/env';
import {
  emptyResults,
  pickPreset,
  presetName,
  requestRpContext,
  verifyProof,
  type ProbeResults,
  type VerifyResponse,
} from '../../lib/probeApi';
import { ProbeReadouts } from './ProbeReadouts';

/**
 * `PUBLIC_COORD_DECIMALS` in packages/shared/src/constants.ts — 3 decimals, ≈100 m. Typed here
 * rather than imported: `@legwork/shared`'s entry point re-exports `./constants.js` over
 * `constants.ts`, which Turbopack will not resolve, so importing it fails `next build`.
 * See the PR for the fix that belongs in packages/shared.
 */
const PUBLIC_COORD_DECIMALS = 3;

const GEO_TIMEOUT_MS = 10_000;
const WALLET_AUTH_TTL_MS = 10 * 60 * 1000;
const NONCE_BYTES = 16;
const SIGNATURE_HEAD = 10;
const SIGNATURE_TAIL = 6;

function round(value: number): number {
  const factor = 10 ** PUBLIC_COORD_DECIMALS;
  return Math.round(value * factor) / factor;
}

function nonceHex(): string {
  const bytes = new Uint8Array(NONCE_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function message(error: unknown): string {
  if (error instanceof ApiError) return `${error.status} ${JSON.stringify(error.body)}`;
  if (error instanceof Error) return error.message;
  return String(error);
}

const GEO_CODES: Record<number, 'PERMISSION_DENIED' | 'POSITION_UNAVAILABLE' | 'TIMEOUT'> = {
  1: 'PERMISSION_DENIED',
  2: 'POSITION_UNAVAILABLE',
  3: 'TIMEOUT',
};

export default function ProbePage() {
  const { installed } = useMiniKit();
  const [mounted, setMounted] = useState(false);
  const [results, setResults] = useState<ProbeResults>(() => emptyResults(CREDENTIAL_LEVEL));
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const verified = useRef<VerifyResponse | null>(null);

  // The widget touches the World App bridge, so it only ever mounts in the browser.
  useEffect(() => {
    setMounted(true);
    setResults((previous) => ({
      ...previous,
      env: {
        minikit_installed: MiniKit.isInstalled(),
        user_agent: navigator.userAgent,
        viewport: `${window.innerWidth} × ${window.innerHeight}`,
        level_env: CREDENTIAL_LEVEL,
      },
    }));
  }, []);

  const stamp = useCallback(() => new Date().toISOString(), []);

  const runIdkit = useCallback(async () => {
    setBusy(true);
    verified.current = null;
    try {
      const { rp_context } = await requestRpContext(WORLD_ACTION);
      setRpContext(rp_context);
      setResults((previous) => ({
        ...previous,
        ran_at: stamp(),
        idkit: {
          preset: presetName(CREDENTIAL_LEVEL),
          rp_context: { nonce: rp_context.nonce, expires_at: rp_context.expires_at },
          widget_result: null,
          api_response: null,
          error: null,
        },
      }));
      setOpen(true);
    } catch (error) {
      setResults((previous) => ({
        ...previous,
        ran_at: stamp(),
        idkit: {
          preset: presetName(CREDENTIAL_LEVEL),
          rp_context: null,
          widget_result: null,
          api_response: null,
          error: message(error),
        },
      }));
    } finally {
      setBusy(false);
    }
  }, [stamp]);

  // Forwarded as-is. A non-2xx throws, which is how the widget shows the failure.
  const handleVerify = useCallback(async (result: IDKitResult) => {
    verified.current = await verifyProof(result);
  }, []);

  const onSuccess = useCallback(
    (result: IDKitResult) => {
      const response = verified.current;
      setResults((previous) => ({
        ...previous,
        ran_at: stamp(),
        idkit: {
          preset: presetName(CREDENTIAL_LEVEL),
          rp_context: previous.idkit?.rp_context ?? null,
          widget_result: result as unknown as Record<string, unknown>,
          api_response: response
            ? { verified: response.verified, nullifier: response.nullifier, level: response.level }
            : null,
          error: null,
        },
      }));
    },
    [stamp],
  );

  const onError = useCallback(
    (code: string) => {
      setResults((previous) => ({
        ...previous,
        ran_at: stamp(),
        idkit: {
          preset: presetName(CREDENTIAL_LEVEL),
          rp_context: previous.idkit?.rp_context ?? null,
          widget_result: previous.idkit?.widget_result ?? null,
          api_response: previous.idkit?.api_response ?? null,
          error: code,
        },
      }));
    },
    [stamp],
  );

  const onFile = useCallback(
    (file: File | null) => {
      if (!file) return;
      setResults((previous) => ({
        ...previous,
        ran_at: stamp(),
        camera: {
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
          camera_opened_directly: previous.camera?.camera_opened_directly ?? false,
        },
      }));
    },
    [stamp],
  );

  const onCameraDirectChange = useCallback((checked: boolean) => {
    setResults((previous) =>
      previous.camera
        ? { ...previous, camera: { ...previous.camera, camera_opened_directly: checked } }
        : previous,
    );
  }, []);

  const runGeolocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setResults((previous) => ({
        ...previous,
        ran_at: stamp(),
        geolocation: { ok: false, code: 'unsupported', message: 'navigator.geolocation is absent' },
      }));
      return;
    }
    const startedAt = Date.now();
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setResults((previous) => ({
          ...previous,
          ran_at: stamp(),
          geolocation: {
            ok: true,
            lat: round(position.coords.latitude),
            lon: round(position.coords.longitude),
            accuracy_m: Math.round(position.coords.accuracy),
            time_to_fix_ms: Date.now() - startedAt,
          },
        }));
      },
      (error) => {
        setResults((previous) => ({
          ...previous,
          ran_at: stamp(),
          geolocation: {
            ok: false,
            code: GEO_CODES[error.code] ?? 'POSITION_UNAVAILABLE',
            message: error.message,
          },
        }));
      },
      { enableHighAccuracy: true, timeout: GEO_TIMEOUT_MS, maximumAge: 0 },
    );
  }, [stamp]);

  const runWalletAuth = useCallback(async () => {
    if (!MiniKit.isInstalled()) {
      setResults((previous) => ({
        ...previous,
        ran_at: stamp(),
        walletAuth: {
          ok: false,
          error: 'MiniKit not installed — open this URL inside World App',
        },
      }));
      return;
    }
    try {
      const result = await MiniKit.walletAuth({
        nonce: nonceHex(),
        statement: 'Legwork probe',
        expirationTime: new Date(Date.now() + WALLET_AUTH_TTL_MS),
      });
      const signature = result.data.signature ?? '';
      setResults((previous) => ({
        ...previous,
        ran_at: stamp(),
        walletAuth: {
          ok: true,
          executedWith: String(result.executedWith),
          address: result.data.address,
          message: result.data.message,
          signature_preview:
            signature.length > SIGNATURE_HEAD + SIGNATURE_TAIL
              ? `${signature.slice(0, SIGNATURE_HEAD)}…${signature.slice(-SIGNATURE_TAIL)}`
              : signature,
        },
      }));
    } catch (error) {
      setResults((previous) => ({
        ...previous,
        ran_at: stamp(),
        walletAuth: { ok: false, error: message(error) },
      }));
    }
  }, [stamp]);

  const onCopyJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(results, null, 2));
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }, [results]);

  return (
    <>
      <h1 className="lw-h1">S2&apos; probe</h1>
      <p style={{ color: 'var(--ink-text-2)' }}>
        Four readouts for the World App spike. Nothing here is a session and nothing here moves
        money. MiniKit {installed ? 'is' : 'is not'} installed on this webview.
      </p>
      <ProbeReadouts
        busy={busy}
        copyState={copyState}
        onCameraDirectChange={onCameraDirectChange}
        onCopyJson={onCopyJson}
        onFile={onFile}
        onRunGeolocation={runGeolocation}
        onRunIdkit={runIdkit}
        onRunWalletAuth={runWalletAuth}
        results={results}
        widget={
          mounted && rpContext && WORLD_APP_ID ? (
            <IDKitRequestWidget
              action={WORLD_ACTION}
              allow_legacy_proofs
              app_id={WORLD_APP_ID as `app_${string}`}
              handleVerify={handleVerify}
              onError={(code) => onError(String(code))}
              onOpenChange={setOpen}
              onSuccess={onSuccess}
              open={open}
              preset={pickPreset(CREDENTIAL_LEVEL)}
              rp_context={rpContext}
            />
          ) : null
        }
      />
    </>
  );
}
