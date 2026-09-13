/**
 * Locked copy, held once so no page can drift. Reproduce character for character.
 * These are locked in wording and selected by credential, never edited per page.
 */

import {
  CREDENTIAL_LABEL,
  claimSentence,
  trustModelSentence,
  type CredentialLevel,
} from '@legwork/shared';

export { claimSentence, trustModelSentence };

/** The level the dashboard server resolved. Unset or unknown stays `orb`, so merge changes no string. */
export function resolvedCredentialLevel(): CredentialLevel {
  const value = process.env.WORLD_CREDENTIAL_LEVEL;
  if (value && value in CREDENTIAL_LABEL) return value as CredentialLevel;
  return 'orb';
}

export const TAGLINE =
  "Agents hire verified humans for the legwork software can't do. Escrow releases on proof.";

/** Orb wording, held for surfaces that do not yet read a level. Byte-identical to today. */
export const CLAIM = claimSentence('orb');

/** Orb wording, held for surfaces that do not yet read a level. Byte-identical to today. */
export const TRUST_MODEL = trustModelSentence('orb');

export const TRUST_MODEL_CLOSER = 'Bot-proof, not fraud-proof.';

export const X402_SENTENCE =
  'An MCP client cannot answer an x402 challenge; the payer must hold a key.';

/** README's opening paragraph, rewritten for a product that resolves a place anywhere OpenStreetMap knows it, under 320 characters. */
export const LANDING_HERO =
  'An agent posts a real-world task — is this shop in Lisbon open, how long is the queue in New York, what does the sign in Berlin say — and funds it in USDC escrow. A World ID-verified person nearby claims it, does it, and submits proof. The escrow releases on proof.';
