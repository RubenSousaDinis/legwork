/**
 * A World ID failure code, in one plain sentence.
 *
 * A code from the widget is not a refusal — nobody was accused of anything and no money
 * moved — so it is never amber, and it is never the only thing on screen either. The raw
 * code travels beside the sentence and stays visible: it is what the operator reads out of
 * the phone log, and it is the only part of a failure that is the same for everyone.
 *
 * The codes are the ones IDKit documents. Anything unlisted keeps its code and takes the
 * fallback sentence rather than being dressed up as something this app understands.
 */

const CLOSED_THE_WIDGET = 'You closed World ID before finishing. Try again.';
const NO_CREDENTIAL =
  'This World ID has no credential this app can use yet. Add Orb (registration) or Selfie Check (claim) in World App or World ID Sandbox, then try again.';
const WRONG_ENVIRONMENT =
  'World App and this app are on different World ID environments (staging vs production vs sandbox).';
const SANDBOX_PROOF_REFUSED =
  'World ID Sandbox finished the camera check, then World refused the proof for this production app. Retry with World App if you have it.';
const SELFIE_DISABLED =
  'Selfie Check is disabled for this app in this environment. The Sandbox grant may not have reached the phone.';
const STILL_REGISTERING = 'World ID is still registering that credential. Wait a minute and try again.';
const NO_ANSWER = 'World ID did not answer. Check the connection and try again.';
const ALREADY_VERIFIED = 'This World ID already verified for Legwork.';
const OUR_CONFIGURATION = "Legwork's World ID configuration was refused. This is on our side.";
const MISSING_APP_ID =
  'This mini-app build has no World ID app id. Restart the mini-app so NEXT_PUBLIC_WORLD_APP_ID from the root .env is picked up.';

/** Everything else, including a code World App has not documented yet. */
export const IDKIT_FALLBACK_SENTENCE = 'World ID could not verify you.';

export const IDKIT_SENTENCES: Record<string, string> = {
  user_rejected: CLOSED_THE_WIDGET,
  verification_rejected: CLOSED_THE_WIDGET,
  verification_disabled: SELFIE_DISABLED,

  credential_unavailable: NO_CREDENTIAL,
  world_id_4_not_available: NO_CREDENTIAL,
  world_id_3_not_available: NO_CREDENTIAL,

  invalid_network: WRONG_ENVIRONMENT,
  environment_mismatch: SANDBOX_PROOF_REFUSED,

  inclusion_proof_pending: STILL_REGISTERING,
  inclusion_proof_failed: STILL_REGISTERING,

  connection_failed: NO_ANSWER,
  timeout: NO_ANSWER,
  unexpected_response: NO_ANSWER,
  generic_error: NO_ANSWER,
  missing_app_id: MISSING_APP_ID,

  max_verifications_reached: ALREADY_VERIFIED,
  nullifier_replayed: ALREADY_VERIFIED,

  invalid_rp_signature: OUR_CONFIGURATION,
  rp_signature_expired: OUR_CONFIGURATION,
  timestamp_too_old: OUR_CONFIGURATION,
  timestamp_too_far_in_future: OUR_CONFIGURATION,
  invalid_timestamp: OUR_CONFIGURATION,
  duplicate_nonce: OUR_CONFIGURATION,
  unknown_rp: OUR_CONFIGURATION,
  inactive_rp: OUR_CONFIGURATION,
  invalid_rp_id_format: OUR_CONFIGURATION,
  malformed_request: OUR_CONFIGURATION,
};

export type IdkitErrorDescription = { sentence: string; code: string };

export function describeIdkitError(code: string): IdkitErrorDescription {
  return { sentence: IDKIT_SENTENCES[code] ?? IDKIT_FALLBACK_SENTENCE, code };
}
