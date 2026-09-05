/**
 * Public configuration. Nothing secret is read here: `NEXT_PUBLIC_*` values ship in the
 * client bundle. Server-only keys (`WORLD_RP_SIGNING_KEY`, …) are read in route handlers.
 * A missing value warns and falls back — it never throws, because the probe has to render
 * on a phone that was handed a half-filled Vercel environment.
 */

/** The World ID action every worker verifies against. */
export const WORLD_ACTION = 'legwork-worker';

export type CredentialLevel = 'selfie' | 'orb';

function readAppId(): string {
  const value = process.env.NEXT_PUBLIC_WORLD_APP_ID ?? '';
  if (!value) console.warn('[env] NEXT_PUBLIC_WORLD_APP_ID is not set — IDKit will not open.');
  return value;
}

function readCredentialLevel(): CredentialLevel {
  const value = process.env.NEXT_PUBLIC_WORLD_CREDENTIAL_LEVEL;
  if (value === 'selfie' || value === 'orb') return value;
  console.warn(
    `[env] NEXT_PUBLIC_WORLD_CREDENTIAL_LEVEL is ${
      value ? `"${value}"` : 'not set'
    } — falling back to "orb".`,
  );
  return 'orb';
}

function readApiBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
  if (!value) console.warn('[env] NEXT_PUBLIC_API_BASE_URL is not set — /api/* rewrites to http://localhost:3001.');
  return value;
}

export const WORLD_APP_ID = readAppId();
export const CREDENTIAL_LEVEL = readCredentialLevel();
export const API_BASE_URL = readApiBaseUrl();
