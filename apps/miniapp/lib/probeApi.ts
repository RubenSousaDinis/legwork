import { orbLegacy, selfieCheckLegacy, type Preset, type RpContext } from '@worldcoin/idkit-core';
import { apiFetch } from './api';
import { WORLD_ACTION, type CredentialLevel } from './env';

/** `POST /idkit/request` — the wrapper is the one in packages/shared/src/api-contract.ts. */
export type RpContextResponse = { rp_context: RpContext };

/**
 * `POST /idkit/verify`. `world_response` is the probe-only extra the temporary route adds so
 * the operator can read World's raw payload shape; it goes away with the route in T-24.
 */
export type VerifyResponse = {
  verified: true;
  nullifier: string;
  level: string;
  world_response?: unknown;
};

export type PresetName = 'selfieCheckLegacy' | 'orbLegacy';

/**
 * Selfie Check when the Portal granted access, Orb otherwise — and Orb whenever the level is
 * unset, which is the §2 default. The IDKit signal is not part of our contract, so it is ''.
 */
export function pickPreset(level: CredentialLevel | undefined): Preset {
  return level === 'selfie' ? selfieCheckLegacy({ signal: '' }) : orbLegacy({ signal: '' });
}

export function presetName(level: CredentialLevel | undefined): PresetName {
  return level === 'selfie' ? 'selfieCheckLegacy' : 'orbLegacy';
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
