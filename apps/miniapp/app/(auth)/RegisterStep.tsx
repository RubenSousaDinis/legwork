'use client';

import { Chip } from '../../components/ui/Chip';
import type { AreaSource } from '../../lib/area';
import { DEFAULT_AREA, DEFAULT_AREA_LABEL } from '../../lib/area';

const BASESCAN_TX = 'https://sepolia.basescan.org/tx/';

export const PAYOUT_KEY_WARNING =
  'Stored only in this browser. If you clear site data you lose access to unpaid earnings. Legwork never sees this key.';

export type RegisterStepProps = {
  /** `null` while the relayer is still waiting on the hash. */
  tx: string | null;
  /**
   * The web path's generated payout key. Shown here rather than as a gate before the chain
   * write: nothing about it is a decision, but a worker whose earnings live behind a key in
   * one browser has to be told once. Omitted inside World App, where the wallet is the
   * address and there is no key to lose.
   */
  payoutAddress?: string | null;
  /** The cell this worker was registered in, and where it came from. */
  area?: string | null;
  areaSource?: AreaSource;
};

/**
 * The relayed registration. Legwork signs the attestation and pays the gas, which is why the
 * chip says `operator-attested` and the transaction is linked rather than described.
 */
export function RegisterStep({
  tx,
  payoutAddress = null,
  area = null,
  areaSource = 'default',
}: RegisterStepProps) {
  return (
    <section className="lw-card" data-step="register">
      <p className="lw-list-label">Register</p>
      {tx === null ? (
        <p className="lw-body" data-floor="20">
          Registering you onchain…
        </p>
      ) : (
        <>
          <p className="lw-body" data-floor="20">
            Registered. Opening your task list.
          </p>
          <p className="lw-chips">
            <Chip tone="verified" floor={20}>
              <a data-hit="44" href={`${BASESCAN_TX}${tx}`} rel="noreferrer" target="_blank">
                {`${tx.slice(0, 10)}… ↗`}
              </a>
            </Chip>
            <Chip tone="neutral" floor={20}>
              operator-attested
            </Chip>
          </p>
          {area === null ? null : (
            <div data-area="binding">
              <p className="lw-body" data-floor="20">{`Registered in ${area}`}</p>
              <p className="lw-meta" data-area-source={areaSource}>
                {areaSource === 'gps'
                  ? "from this phone's location"
                  : `default cell — ${DEFAULT_AREA_LABEL} (${DEFAULT_AREA}). This phone gave no location fix.`}
              </p>
            </div>
          )}
          {payoutAddress === null ? null : (
            <>
              <p className="lw-list-label lw-list-label--flush">Your payout address</p>
              <p className="lw-address lw-mono-address">{payoutAddress}</p>
              <div className="lw-tile" data-warning="payout-key" data-floor="20">
                {PAYOUT_KEY_WARNING}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
