/**
 * The probe's readout types.
 *
 * T-24 moved `pickPreset`, `requestRpContext` and `verifyProof` to `lib/worldid.ts`; they are
 * re-exported here so `app/probe/**` — T-05's, and out of this task's scope — keeps compiling
 * against the import path it was written with. The brief asks for this file to be deleted; the
 * six symbols below are probe-only and have no home in `lib/worldid.ts`, and every remaining
 * importer (`app/probe/page.tsx`, `app/probe/ProbeReadouts.tsx` and four `tests/*` files) sits
 * outside this task's `owned_paths`. See the PR body — the deletion is the lead's call.
 */

import type { CredentialLevel } from './env';

export {
  pickPreset,
  requestRpContext,
  verifyProof,
  type RpContextResponse,
} from './worldid';

import type { VerifyResponse as WorldIdVerifyResponse } from './worldid';

/**
 * `POST /idkit/verify`. `world_response` is the probe-only extra the temporary route added so
 * the operator could read World's raw payload shape; the real API does not send it, so it is
 * optional here.
 */
export type VerifyResponse = WorldIdVerifyResponse & { world_response?: unknown };

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
