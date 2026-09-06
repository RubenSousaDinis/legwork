/**
 * Spike S3 — dynamic price math for the x402 seller.
 *
 * The agent pays 3.45 for a 3.00 task: the 15 % fee is added on top of the posted
 * rate, never deducted from it. All arithmetic is 6-decimal integer arithmetic on
 * bigints — `3.00 * 1.15` is 3.4499999999999997 in IEEE-754, which would sign an
 * authorization for the wrong number of units.
 */

const USDC_DECIMALS = 6n;
const ONE_USDC_UNITS = 10n ** USDC_DECIMALS; // 1_000_000n
const FEE_BPS = 1500n; // 15 % expressed in basis points
const BPS_DENOMINATOR = 10000n;

/** A plain 2-decimal amount, e.g. `"3.00"`. Anything else is a programming error. */
const AMOUNT_PATTERN = /^\d+\.\d{2}$/;

/**
 * Parse a 2-decimal USDC string into 6-decimal integer units, then add the 15 % fee.
 *
 *   priceUnits("3.00") === 3_450_000n   // agent pays 3.45, worker receives 3.00, fee 0.45
 *   priceUnits("1.00") === 1_150_000n
 */
export function priceUnits(amountUsdc: string): bigint {
  if (!AMOUNT_PATTERN.test(amountUsdc)) {
    throw new Error(`amount_usdc must be a 2-decimal string like "3.00", got ${JSON.stringify(amountUsdc)}`);
  }
  const [whole, cents] = amountUsdc.split(".");
  const units = BigInt(whole) * ONE_USDC_UNITS + BigInt(cents) * (ONE_USDC_UNITS / 100n);
  return units + (units * FEE_BPS) / BPS_DENOMINATOR;
}

/** Render 6-decimal integer units back as a 2-decimal string, for the 402 body. */
export function formatUnits2dp(units: bigint): string {
  const whole = units / ONE_USDC_UNITS;
  const cents = (units % ONE_USDC_UNITS) / (ONE_USDC_UNITS / 100n);
  return `${whole}.${cents.toString().padStart(2, "0")}`;
}
