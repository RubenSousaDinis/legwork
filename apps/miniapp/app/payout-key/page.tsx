'use client';

import { useEffect, useState } from 'react';
import { Waiting } from '../../components/ui/Waiting';
import { requireVerified } from '../../lib/session';
import { getPayoutAddress } from '../../lib/workerKey';
import { PayoutKeyStep } from '../(auth)/PayoutKeyStep';

/**
 * `/payout-key` — the back-up screen for the generated payout key.
 *
 * Registration no longer stops on the key screen, so this is where the reveal, copy and
 * import controls live: the key in this browser is the only copy that exists, and a worker
 * has to be able to reach it after signing up rather than only during it.
 */
export const NO_KEY_ON_THIS_PHONE = 'No payout key on this phone — your World App wallet is your payout address.';

export default function PayoutKeyPage() {
  const session = requireVerified();
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    setAddress(getPayoutAddress());
  }, []);

  if (session.status !== 'verified') {
    return <Waiting step="session">Opening your payout key…</Waiting>;
  }

  if (address === null) {
    return (
      <div className="lw-card" data-screen="payout-key">
        <p className="lw-list-label">payout key</p>
        <p className="lw-body" data-floor="20">
          {NO_KEY_ON_THIS_PHONE}
        </p>
      </div>
    );
  }

  return (
    <div data-screen="payout-key">
      <PayoutKeyStep address={address} busy={false} manage onImported={setAddress} />
    </div>
  );
}
