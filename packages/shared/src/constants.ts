import type { TaskType } from './enums.js';

/** Economics, limits and timings frozen in T-01a. */

export const USDC_DECIMALS = 6;
export const FEE_BPS = 1500n;

/**
 * The fee is charged ON TOP of what the worker receives. For a 3.00 task the agent pays
 * 3.45, the escrow locks 3.45, the worker receives 3.00 and the treasury takes 0.45.
 * There is no deducted figure anywhere in this system.
 */
export function feeOn(amountUnits: bigint): bigint {
  return (amountUnits * FEE_BPS) / 10_000n;
}

export function priceWithFee(amountUnits: bigint): bigint {
  return amountUnits + feeOn(amountUnits);
}

export function toUsdcUnits(n: number): bigint {
  return BigInt(Math.round(n * 10 ** USDC_DECIMALS));
}

export function fromUsdcUnits(units: bigint): number {
  return Number(units) / 10 ** USDC_DECIMALS;
}

/** A worker is never offered less than this for a given type of errand. */
export const PRICE_FLOOR_USDC = {
  'verify-open': 3.0,
  'photo-of': 3.0,
  'call-confirm': 2.0,
  'compare-two': 1.0,
} as const satisfies Record<TaskType, number>;

export const MAX_TASK_AMOUNT_USDC = 10;
export const MAX_OPEN_TASKS_PER_BUYER = 5;
export const DAILY_CAP_USDC = 25;

export const DEFAULT_CLAIM_TTL_S = 1800;
export const DEFAULT_SUBMIT_TTL_S = 3600;
export const DEFAULT_DISPUTE_WINDOW_S = 86400;
/** The filmed run shortens the window so the release beat is watchable. Disclosed on screen. */
export const DEMO_DISPUTE_WINDOW_S = 120;
export const CLAIM_COOLDOWN_S = 900;

export const SPEC_MAX_CHARS = 300;
export const NOTE_MAX_CHARS = 120;
export const NEED_BY_MIN_LEAD_S = 1200;

/** A submitted proof must be within this many metres of the task's place. */
export const GEOFENCE_M = 150;
/** Public surfaces round coordinates to 3 decimals (about 100 m). Exact ones stay private. */
export const PUBLIC_COORD_DECIMALS = 3;

export const LONGPOLL_MAX_S = 50;

export const CLASSIFIER_TIMEOUT_MS = 3000;
export const CLASSIFIER_TIMEOUT_LABEL = 'keyword class — classifier timeout';

/** Told to the agent on every refusal, so a rejected task is not simply rephrased and retried. */
export const NO_RETRY_SENTENCE =
  'do not rephrase and retry; report this refusal to your principal';
