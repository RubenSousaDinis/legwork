'use client';

import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { exportPrivateKey, importPrivateKey } from '../../lib/workerKey';

const BASESCAN = 'https://sepolia.basescan.org/address/';

export type PayoutKeyStepProps = {
  address: string;
  /** Opened straight away when a 409 said this World ID already has a worker account. */
  importOpen?: boolean;
  onImported: (address: string) => void;
  onContinue: () => void;
  busy: boolean;
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
  busy,
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
      <p className="lw-section-label">Your payout address</p>
      <p className="lw-mono-address" style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
        {address}
      </p>
      <p>
        <a data-hit="44" href={`${BASESCAN}${address}`} rel="noreferrer" target="_blank">
          Basescan ↗
        </a>
      </p>

      <div className="lw-card" data-warning="payout-key" data-floor="20">
        Stored only in this browser. If you clear site data you lose access to unpaid earnings.
        Legwork never sees this key.
      </div>

      {revealed === null ? (
        <Button variant="ghost" onClick={reveal}>
          Reveal and copy private key
        </Button>
      ) : (
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }} data-revealed="true">
            {revealed}
          </p>
          <Button variant="ghost" onClick={copy}>
            Copy private key
          </Button>
          <Button variant="ghost" onClick={() => setRevealed(null)}>
            Hide
          </Button>
          {copied ? (
            <Chip tone="neutral" floor={20}>
              copied
            </Chip>
          ) : null}
        </div>
      )}

      <Button variant="ghost" onClick={() => setShowImport((open) => !open)}>
        Import an existing payout key
      </Button>

      {showImport ? (
        <div data-import="open">
          <label htmlFor="payout-key-import">Import an existing payout key</label>
          <textarea
            id="payout-key-import"
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            spellCheck={false}
            value={draft}
          />
          <Button variant="ghost" onClick={restore}>
            Restore
          </Button>
          {error === null ? null : <p className="lw-error">{error}</p>}
        </div>
      ) : null}

      <Button variant="primary" size="lg" full disabled={busy} onClick={onContinue}>
        Register as a worker
      </Button>
    </section>
  );
}
