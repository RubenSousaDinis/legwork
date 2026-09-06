'use client';

import { useEffect, useState } from 'react';
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
    return <p className="lw-placeholder">Opening your earnings…</p>;
  }

  if (earnings === null) {
    return <p className="lw-placeholder">Reading what you earned…</p>;
  }

  return (
    <div data-screen="earnings">
      <div className="lw-card">
        <p className="lw-section-label" style={{ margin: '0 0 var(--s-2)' }}>
          released to you
        </p>

        <p
          data-earnings="released"
          data-floor="20"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '56px',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
            margin: 0,
          }}
        >
          {earnings.released_usdc.toFixed(2)}
        </p>

        <p style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)', margin: 'var(--s-2) 0 0' }}>
          <span style={{ color: 'var(--ink-text-2)', fontFamily: 'var(--font-mono)' }}>
            {TESTNET_USDC}
          </span>
          <Chip tone="neutral" floor={20}>
            {NOT_SPENDABLE}
          </Chip>
        </p>

        <p
          data-earnings="tally"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', margin: 'var(--s-4) 0 0' }}
        >
          {tallyLine(earnings)}
        </p>

        <p data-earnings="earned-only" style={{ color: 'var(--ink-text-2)', margin: 'var(--s-3) 0 0' }}>
          {EARNED_ONLY}
        </p>
      </div>

      <div className="lw-card" style={{ marginTop: 'var(--s-4)' }}>
        <p className="lw-section-label" style={{ margin: '0 0 var(--s-2)' }}>
          payout address
        </p>
        <p
          data-payout="address"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', margin: 0, overflowWrap: 'anywhere' }}
        >
          {address ?? 'no payout key on this phone yet'}
        </p>

        {address === null ? null : (
          <p style={{ margin: 'var(--s-3) 0 0' }}>
            <Chip tone="neutral" floor={20}>
              <a data-hit="44" href={`${BASESCAN_ADDRESS}${address}`} rel="noreferrer" target="_blank">
                Basescan ↗
              </a>
            </Chip>
          </p>
        )}

        {/* The key screen is T-24's, on `/`. It is the only copy of the key that exists. */}
        <p style={{ margin: 'var(--s-4) 0 0' }}>
          <a data-hit="44" data-link="backup" href="/">
            {BACK_UP_KEY}
          </a>
        </p>
      </div>
    </div>
  );
}
