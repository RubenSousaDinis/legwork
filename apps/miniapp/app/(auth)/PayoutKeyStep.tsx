'use client';

import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import type { AreaSource } from '../../lib/area';
import { exportPrivateKey, importPrivateKey } from '../../lib/workerKey';

const BASESCAN = 'https://sepolia.basescan.org/address/';

export const WALLET_PAYOUT_COPY = 'Your World App wallet is your payout address';
export const SIGN_IN_WITH_WALLET = 'Sign in with your World App wallet';

export type PayoutKeyStepProps = {
  address: string;
  /** Opened straight away when a 409 said this World ID already has a worker account. */
  importOpen?: boolean;
  onImported: (address: string) => void;
  /** Fresh registration. Absent in the conflict state — that button cannot succeed there. */
  onContinue?: () => void;
  /** Returning worker, inside World App only. A 409 never issues the idkit cookie. */
  onSignIn?: () => void;
  busy: boolean;
  conflict?: boolean;
  area?: string | null;
  areaSource?: AreaSource;
  onRetryLocation?: () => void;
  /**
   * Inside World App the wallet is the payout address: no key to reveal, import, or lose.
   * The web path keeps the generated key and the controls that go with it.
   */
  wallet?: boolean;
};

/**
 * The payout key screen. The private key is read out of `localStorage` only while the reveal
 * box is open and is dropped again on hide — it is never sent, never logged, and never sits
 * in state longer than the two taps it takes to copy it.
 */
export function PayoutKeyStep({
  address,
  importOpen = false,
  onImported,
  onContinue,
  onSignIn,
  busy,
  conflict = false,
  area = null,
  areaSource = 'default',
  onRetryLocation,
  wallet = false,
}: PayoutKeyStepProps) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showImport, setShowImport] = useState(importOpen);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reveal = () => {
    setRevealed(exportPrivateKey());
    setCopied(false);
  };

  const copy = async () => {
    if (revealed === null) return;
    try {
      await navigator.clipboard.writeText(revealed);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const restore = () => {
    setError(null);
    try {
      const { address: restored } = importPrivateKey(draft);
      setDraft('');
      setRevealed(null);
      setShowImport(false);
      onImported(restored);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    }
  };

  return (
    <section className="lw-card" data-step="payout-key">
      <p className={wallet ? 'lw-body' : 'lw-list-label'} {...(wallet ? { 'data-floor': '20' } : {})}>
        {wallet ? WALLET_PAYOUT_COPY : 'Your payout address'}
      </p>
      {conflict && !wallet ? (
        <p className="lw-list-label lw-list-label--flush" data-label="held-key">
          this phone holds
        </p>
      ) : null}
      <p className="lw-address lw-mono-address">{address}</p>
      <p className="lw-chips lw-chips--stacked">
        <a className="lw-quiet-link" data-hit="44" href={`${BASESCAN}${address}`} rel="noreferrer" target="_blank">
          Basescan ↗
        </a>
      </p>

      {wallet ? null : (
        <>
          {/* A flat tile, not a nested card: one card inside another reads as two surfaces. */}
          <div className="lw-tile" data-warning="payout-key" data-floor="20">
            Stored only in this browser. If you clear site data you lose access to unpaid earnings.
            Legwork never sees this key.
          </div>

          <div className="lw-actions lw-actions--top">
            {revealed === null ? (
              <Button variant="ghost" full onClick={reveal}>
                Reveal and copy private key
              </Button>
            ) : (
              <>
                <p className="lw-address" data-revealed="true">
                  {revealed}
                </p>
                <Button variant="ghost" full onClick={copy}>
                  Copy private key
                </Button>
                <Button variant="ghost" full onClick={() => setRevealed(null)}>
                  Hide
                </Button>
                {copied ? (
                  <p className="lw-chips">
                    <Chip tone="neutral" floor={20}>
                      copied
                    </Chip>
                  </p>
                ) : null}
              </>
            )}

            <Button variant="ghost" full onClick={() => setShowImport((open) => !open)}>
              Import an existing payout key
            </Button>

            {showImport ? (
              <div data-import="open">
                <label className="lw-list-label lw-list-label--flush" htmlFor="payout-key-import">
                  Import an existing payout key
                </label>
                <textarea
                  className="lw-textarea"
                  id="payout-key-import"
                  onChange={(event) => setDraft(event.target.value)}
                  rows={3}
                  spellCheck={false}
                  value={draft}
                />
                <div className="lw-actions lw-actions--top">
                  <Button variant="ghost" full onClick={restore}>
                    Restore
                  </Button>
                  {error === null ? null : <p className="lw-error">{error}</p>}
                </div>
              </div>
            ) : null}
          </div>
        </>
      )}

      <div className="lw-actions lw-actions--top">
        {conflict ? (
          onSignIn ? (
            <Button variant="primary" size="lg" full disabled={busy} onClick={onSignIn}>
              {SIGN_IN_WITH_WALLET}
            </Button>
          ) : null
        ) : (
          <>
            {area !== null ? (
              <div data-area="binding">
                <p className="lw-body" data-floor="20">
                  {`You will be registered in ${area}`}
                </p>
                <p className="lw-meta" data-area-source={areaSource}>
                  {areaSource === 'gps'
                    ? "from this phone's location"
                    : 'default — this phone gave no location fix'}
                </p>
                {areaSource === 'default' ? (
                  <Button variant="ghost" full onClick={onRetryLocation}>
                    Use my location
                  </Button>
                ) : null}
              </div>
            ) : null}
            <Button variant="primary" size="lg" full disabled={busy} onClick={onContinue}>
              Register as a worker
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
