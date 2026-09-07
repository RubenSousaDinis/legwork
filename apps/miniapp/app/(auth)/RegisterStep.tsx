'use client';

import { Chip } from '../../components/ui/Chip';

const BASESCAN_TX = 'https://sepolia.basescan.org/tx/';

export type RegisterStepProps = {
  /** `null` while the relayer is still waiting on the hash. */
  tx: string | null;
};

/**
 * The relayed registration. Legwork signs the attestation and pays the gas, which is why the
 * chip says `operator-attested` and the transaction is linked rather than described.
 */
export function RegisterStep({ tx }: RegisterStepProps) {
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
        </>
      )}
    </section>
  );
}
