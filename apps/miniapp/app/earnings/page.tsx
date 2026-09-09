'use client';

import { useEffect, useState } from 'react';
import { Waiting } from '../../components/ui/Waiting';
import { Chip } from '../../components/ui/Chip';
import { apiFetch } from '../../lib/api';
import { requireVerified } from '../../lib/session';
import { getPayoutAddress } from '../../lib/workerKey';

/**
 * `/earnings` — what this account actually earned, and nothing else.
 *
 * The earned-only rule is the whole design of this page (09-design-prompt): no seeded balance,
 * no seeded score, no completion count the account did not do, and no projection of what a
 * shift "could" pay. Every figure here comes from `GET /me/earnings`, which sums `TaskReleased`
 * to this worker; a fresh account reads `0.00`, and that zero is the honest answer.
 *
 * The figure is testnet USDC on Base Sepolia and says so twice — the unit beside the numeral
 * and the chip beside that. Nobody should leave this screen thinking they can spend it.
 */

const BASESCAN_ADDRESS = 'https://sepolia.basescan.org/address/';

export const NOT_SPENDABLE = 'not spendable';
export const EARNED_ONLY = 'earned only — nothing seeded, nothing projected';
export const BACK_UP_KEY = 'Back up payout key';
export const TESTNET_USDC = 'testnet USDC';

type Earnings = {
  released_usdc: number;
  completed: number;
  score: number;
  distinct_raters: number;
};

/** The mono line under the numeral, in the API's own words. */
export function tallyLine(earnings: Earnings): string {
  return `completed ${earnings.completed} · score ${earnings.score} · distinct raters ${earnings.distinct_raters}`;
}

export default function EarningsPage() {
  const session = requireVerified();
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    setAddress(getPayoutAddress());
  }, []);

  useEffect(() => {
    let live = true;
    void apiFetch<Earnings>('/me/earnings')
      .then((data) => {
        if (live) setEarnings(data);
      })
      .catch(() => {
        // Nothing is invented to fill the gap: the page keeps saying it is loading.
      });
    return () => {
      live = false;
    };
  }, []);

  if (session.status !== 'verified') {
    return <Waiting step="session">Opening your earnings…</Waiting>;
  }

  if (earnings === null) {
    return <Waiting step="earnings">Reading what you earned…</Waiting>;
  }

  return (
    <div data-screen="earnings">
      <div className="lw-card">
        <p className="lw-list-label">released to you</p>

        <p className="lw-stat lw-stat--xl" data-earnings="released" data-floor="20">
          {earnings.released_usdc.toFixed(2)}
        </p>

        <p className="lw-meta lw-meta--top">
          <span>{TESTNET_USDC}</span>
          <Chip tone="neutral" floor={20}>
            {NOT_SPENDABLE}
          </Chip>
        </p>

        <p className="lw-meta lw-meta--top" data-earnings="tally">
          {tallyLine(earnings)}
        </p>

        <p className="lw-note lw-note--top" data-earnings="earned-only">
          {EARNED_ONLY}
        </p>
      </div>

      <div className="lw-card lw-card--top">
        <p className="lw-list-label">payout address</p>
        <p className="lw-address" data-payout="address">
          {address ?? 'no payout key on this phone yet'}
        </p>

        {address === null ? null : (
          <p className="lw-chips">
            <Chip tone="neutral" floor={20}>
              <a data-hit="44" href={`${BASESCAN_ADDRESS}${address}`} rel="noreferrer" target="_blank">
                Basescan ↗
              </a>
            </Chip>
          </p>
        )}

        {/* The key screen is T-24's, on `/`. It is the only copy of the key that exists. */}
        <p className="lw-chips lw-chips--stacked-top">
          <a className="lw-quiet-link" data-hit="44" data-link="backup" href="/">
            {BACK_UP_KEY}
          </a>
        </p>
      </div>
    </div>
  );
}
