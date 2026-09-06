'use client';

import { IDKitRequestWidget, type IDKitResult } from '@worldcoin/idkit';
import { orbLegacy, selfieCheckLegacy, type Preset, type RpContext } from '@worldcoin/idkit-core';
import { createElement, useCallback, useRef, type ReactElement } from 'react';
import { apiFetch } from './api';
import { WORLD_ACTION, WORLD_APP_ID, type CredentialLevel } from './env';

/**
 * World ID verification: the RP context, the widget, and the forward to `POST /idkit/verify`.
 * The two calls go through the same-origin `/api` rewrite, so the idkit-session cookie the
 * verify route sets is a first-party cookie inside the World App webview.
 *
 * This file is `.ts`, not `.tsx`, because `lib/worldid.ts` is the path the brief owns — hence
 * `createElement` rather than JSX for the one component here.
 */

/** `POST /idkit/request` — the wrapper is the one in packages/shared/src/api-contract.ts. */
export type RpContextResponse = { rp_context: RpContext };

export type VerifyResponse = {
  verified: true;
  nullifier: string;
  level: string;
};

/**
 * Selfie Check when the Portal granted access, Orb otherwise — and Orb whenever the level is
 * unset. The IDKit signal is not part of our contract, so it is ''.
 */
export function pickPreset(level: CredentialLevel | undefined): Preset {
  return level === 'selfie' ? selfieCheckLegacy({ signal: '' }) : orbLegacy({ signal: '' });
}

export function requestRpContext(action: string = WORLD_ACTION): Promise<RpContextResponse> {
  return apiFetch<RpContextResponse>('/idkit/request', {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}

/** The IDKit widget result is forwarded as-is — the same object, nothing added or re-shaped. */
export function verifyProof(result: unknown): Promise<VerifyResponse> {
  return apiFetch<VerifyResponse>('/idkit/verify', {
    method: 'POST',
    body: JSON.stringify(result),
  });
}

export type IdkitVerifyProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fetched by the caller from `POST /idkit/request` before the widget opens. */
  rpContext: RpContext;
  level: CredentialLevel;
  onVerified: (response: VerifyResponse) => void;
  /** A widget error code, or whatever `POST /idkit/verify` threw — a 409 arrives here. */
  onFailed: (error: unknown) => void;
};

/**
 * Client-only: the widget talks to the World App bridge, so it never renders on the server.
 * `handleVerify` runs before `onSuccess`, which is what lets the API's answer — not the
 * widget's — decide whether the worker is verified.
 */
export function IdkitVerify({
  open,
  onOpenChange,
  rpContext,
  level,
  onVerified,
  onFailed,
}: IdkitVerifyProps): ReactElement {
  const verified = useRef<VerifyResponse | null>(null);

  const handleVerify = useCallback(
    async (result: IDKitResult) => {
      verified.current = null;
      try {
        verified.current = await verifyProof(result);
      } catch (error) {
        onFailed(error);
        // Rethrown so the widget shows the failure instead of reporting a success.
        throw error;
      }
    },
    [onFailed],
  );

  const onSuccess = useCallback(() => {
    if (verified.current) onVerified(verified.current);
  }, [onVerified]);

  return createElement(IDKitRequestWidget, {
    action: WORLD_ACTION,
    allow_legacy_proofs: true,
    app_id: WORLD_APP_ID as `app_${string}`,
    handleVerify,
    onError: (code: unknown) => onFailed(new Error(String(code))),
    onOpenChange,
    onSuccess,
    open,
    preset: pickPreset(level),
    rp_context: rpContext,
  });
}

// ------------------------------------------------- the /probe readouts

/**
 * `/probe` is T-05's spike page and these are its readout shapes. They live here because
 * `lib/probeApi.ts` is gone (T-24 §2) and the probe's imports move with the three functions
 * above — nothing about `/probe` changed, only where it reads these names from.
 */

export type PresetName = 'selfieCheckLegacy' | 'orbLegacy';

export function presetName(level: CredentialLevel | undefined): PresetName {
  return level === 'selfie' ? 'selfieCheckLegacy' : 'orbLegacy';
}

// ------------------------------------------------------------------ readouts

export type IdkitReadout = {
  preset: PresetName;
  rp_context: { nonce: string; expires_at: number } | null;
  widget_result: Record<string, unknown> | null;
  api_response: { verified: boolean; nullifier: string; level: string } | null;
  error: string | null;
};

export type CameraReadout = {
  name: string;
  size: number;
  type: string;
  lastModified: number;
  /** Ticked by the operator: the native camera opened, not the gallery. */
  camera_opened_directly: boolean;
};

export type GeolocationErrorCode =
  | 'PERMISSION_DENIED'
  | 'POSITION_UNAVAILABLE'
  | 'TIMEOUT'
  | 'unsupported';

export type GeolocationReadout =
  | {
      ok: true;
      /** Rounded to PUBLIC_COORD_DECIMALS (3, ≈100 m). The exact fix is never shown. */
      lat: number;
      lon: number;
      accuracy_m: number;
      time_to_fix_ms: number;
    }
  | { ok: false; code: GeolocationErrorCode; message: string };

export type WalletAuthReadout =
  | {
      ok: true;
      executedWith: string;
      address: string;
      /** The full SIWE text — it is what the spike has to record. */
      message: string;
      signature_preview: string;
    }
  | { ok: false; error: string };

export type EnvReadout = {
  minikit_installed: boolean;
  user_agent: string;
  viewport: string;
  level_env: CredentialLevel;
};

export type ProbeResults = {
  ran_at: string | null;
  level_env: CredentialLevel;
  idkit: IdkitReadout | null;
  camera: CameraReadout | null;
  geolocation: GeolocationReadout | null;
  walletAuth: WalletAuthReadout | null;
  env: EnvReadout | null;
};

export function emptyResults(level: CredentialLevel): ProbeResults {
  return {
    ran_at: null,
    level_env: level,
    idkit: null,
    camera: null,
    geolocation: null,
    walletAuth: null,
    env: null,
  };
}
