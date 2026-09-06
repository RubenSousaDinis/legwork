'use client';

import { useRef, useState } from 'react';
import { apiBase } from '../../lib/data/live';
import { basescanTx, shortHash } from '../../lib/format';
import './admin.css';

/**
 * Operator controls. The admin key is **pasted at runtime and held in React state and
 * nowhere else** — not `localStorage`, not `sessionStorage`, not a cookie, not a query
 * string. It is gone on reload, it is never a build-time env of this app, and it never
 * appears in the DOM: the field is a controlled password input, so React sets the
 * `value` property rather than an attribute.
 */

/** How long the second tap has to arrive. A destructive action is never one click. */
const CONFIRM_WINDOW_MS = 5000;

type Action = 'pause' | 'unpause' | 'resolve' | 'reset-demo' | 'reset-worker';

/** The three that move money or wipe state ask twice. */
const NEEDS_CONFIRM: readonly Action[] = ['resolve', 'reset-demo', 'reset-worker'];

const LABELS: Record<Action, string> = {
  pause: 'pause',
  unpause: 'unpause',
  resolve: 'resolve',
  'reset-demo': 'reset-demo',
  'reset-worker': 'reset-worker',
};

interface Outcome {
  ok: boolean;
  text: string;
  tx?: string;
}

export function AdminPanel() {
  const [key, setKey] = useState('');
  const [taskId, setTaskId] = useState('');
  const [toBuyer, setToBuyer] = useState(false);
  const [nullifier, setNullifier] = useState('');
  const [pending, setPending] = useState<Action | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const disabled = key.length === 0;

  function bodyFor(action: Action): Record<string, unknown> {
    if (action === 'resolve') return { task_id: taskId, to_buyer: toBuyer };
    // The frozen contract requires the word back before it wipes anything.
    if (action === 'reset-demo') return { confirm: 'reset-demo' };
    if (action === 'reset-worker') return { nullifier };
    return {};
  }

  function armConfirm(action: Action): void {
    setPending(action);
    if (confirmTimer.current !== undefined) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setPending(null), CONFIRM_WINDOW_MS);
  }

  async function run(action: Action): Promise<void> {
    if (disabled) return;
    if (NEEDS_CONFIRM.includes(action) && pending !== action) {
      armConfirm(action);
      return;
    }
    if (confirmTimer.current !== undefined) clearTimeout(confirmTimer.current);
    setPending(null);
    setOutcome(null);

    try {
      const response = await fetch(`${apiBase()}/admin/${action}`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'content-type': 'application/json', 'X-Admin-Key': key },
        body: JSON.stringify(bodyFor(action)),
      });
      if (response.status === 401) {
        setOutcome({ ok: false, text: 'key rejected' });
        return;
      }
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; tx?: string; error?: string }
        | null;
      if (!response.ok || !body?.ok) {
        setOutcome({ ok: false, text: body?.error ?? `${action} failed (${response.status})` });
        return;
      }
      setOutcome({ ok: true, text: 'ok', ...(body.tx ? { tx: body.tx } : {}) });
    } catch {
      setOutcome({ ok: false, text: `${action} could not be sent` });
    }
  }

  return (
    <main className="admin" data-testid="admin-panel">
      <header className="admin-head">
        <h1 className="card-title">Operator</h1>
        <p className="mono admin-note">every call is audit-logged by the API</p>
      </header>

      <section className="admin-key card">
        <label className="section-label" htmlFor="admin-key">
          admin key
        </label>
        <input
          id="admin-key"
          className="mono admin-input"
          data-hit="44"
          data-testid="admin-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="pasted, never stored"
        />
        <p className="mono admin-note">held in memory only · gone on reload</p>
      </section>

      <section className="admin-inputs card">
        <div className="section-label">arguments</div>
        <label className="admin-field">
          <span className="mono">task_id</span>
          <input
            className="mono admin-input"
            data-hit="44"
            data-testid="admin-task-id"
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
          />
        </label>
        <label className="admin-field">
          <span className="mono">to_buyer</span>
          <input
            className="admin-toggle"
            data-hit="44"
            data-testid="admin-to-buyer"
            type="checkbox"
            checked={toBuyer}
            onChange={(e) => setToBuyer(e.target.checked)}
          />
        </label>
        <label className="admin-field">
          <span className="mono">nullifier</span>
          <input
            className="mono admin-input"
            data-hit="44"
            data-testid="admin-nullifier"
            value={nullifier}
            onChange={(e) => setNullifier(e.target.value)}
          />
        </label>
      </section>

      <section className="admin-actions card">
        <div className="section-label">actions</div>
        <div className="admin-buttons">
          {(Object.keys(LABELS) as Action[]).map((action) => (
            <button
              key={action}
              type="button"
              className="admin-button mono"
              data-hit="44"
              data-action={action}
              data-armed={pending === action ? 'true' : 'false'}
              disabled={disabled}
              onClick={() => void run(action)}
            >
              {pending === action ? 'Confirm' : LABELS[action]}
            </button>
          ))}
        </div>
        {pending ? (
          <p className="mono admin-armed">
            tap Confirm within 5 seconds to send {LABELS[pending]}
          </p>
        ) : null}
      </section>

      {/* Amber for a failure as well as a success: red exists nowhere in this product. */}
      {outcome ? (
        <p className="mono admin-result" data-testid="admin-result" data-ok={String(outcome.ok)}>
          {outcome.text}
          {outcome.tx ? (
            <>
              {' · tx '}
              <a href={basescanTx(outcome.tx)} target="_blank" rel="noreferrer" data-hit="44">
                {shortHash(outcome.tx)} ↗
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </main>
  );
}
