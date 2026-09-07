'use client';

/**
 * The bar pinned to the bottom of `/tasks`.
 *
 * The figure is `released_usdc` from `GET /me/earnings` and nothing else: earned only,
 * `0.00` for a fresh account, nothing seeded and nothing projected. The unit says testnet
 * twice over — beside the numeral and in the line under the label — because nobody should
 * leave this screen thinking they can spend it.
 *
 * The whole bar is one anchor, so the 44 px target is the bar rather than the numeral in it.
 */

export const EARNINGS_LABEL = 'Earnings';
export const TESTNET_LINE = 'testnet USDC — not spendable';

export type EarningsBarProps = {
  /** `null` until the first read lands; the bar shows `0.00` rather than a blank. */
  releasedUsdc: number | null;
};

export function EarningsBar({ releasedUsdc }: EarningsBarProps) {
  return (
    <a className="lw-earnings-bar" data-earnings-bar="true" data-hit="44" href="/earnings">
      <span className="lw-earnings-bar__left">
        <span className="lw-earnings-bar__label">{EARNINGS_LABEL}</span>
        <span className="lw-meta lw-meta--flush">{TESTNET_LINE}</span>
      </span>
      <span className="lw-price">
        <span className="lw-price__figure" data-earnings="released" data-floor="20">
          {(releasedUsdc ?? 0).toFixed(2)}
        </span>
        <span className="lw-price__unit">USDC</span>
      </span>
    </a>
  );
}
