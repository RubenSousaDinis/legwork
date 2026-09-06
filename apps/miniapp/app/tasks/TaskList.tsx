'use client';

import { CLAIM_COOLDOWN_S } from '@legwork/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TaskCard, type TaskRow } from '../../components/TaskCard';
import { Chip } from '../../components/ui/Chip';
import { ApiError, apiFetch } from '../../lib/api';
import { lastKnownPosition, resolveArea } from '../../lib/area';
import { clearActiveClaim, readActiveClaim, writeActiveClaim, type ActiveClaim } from './activeClaim';

/**
 * The worker's task list. It polls `GET /tasks` every 3 seconds because a claim is a race —
 * a row that is gone needs to disappear before the worker walks to it — and it stops polling
 * the moment the tab is hidden, because a phone in a pocket has no reason to keep asking.
 */

const POLL_MS = 3000;
const EARNINGS_POLL_MS = 60_000;

export const EMPTY_STATE = 'No open tasks near you right now — the list refreshes every 3 s.';
export const NOT_SPENDABLE = 'not spendable';

/** The three 409/403 answers `POST /tasks/:id/claim` is allowed to give, in the worker's words. */
export const CLAIM_ERRORS: Record<string, string> = {
  InCooldown: `You released or let a claim expire recently. You can claim again within ${Math.round(
    CLAIM_COOLDOWN_S / 60,
  )} min.`,
  AlreadyClaimed: 'Someone claimed this task first.',
  SeededCannotClaimExternal:
    'This account is a seeded demo worker; it can only claim operator-funded tasks.',
};

const GENERIC_ERROR = 'That did not go through. Try again in a moment.';

type TasksResponse = { tasks: TaskRow[] };
type ClaimResponse = { tx: string; claim_expires_at: string; submit_deadline: string };
type Earnings = { released_usdc: number };

function errorCode(thrown: unknown): string | null {
  if (!(thrown instanceof ApiError)) return null;
  const body = thrown.body as { error?: unknown } | null;
  return typeof body?.error === 'string' ? body.error : null;
}

/**
 * `area` is the geohash-5 cell and nothing finer; `lat`/`lon` ride along only so the API can
 * sort nearest-first, and only when the worker already granted the permission.
 */
function tasksPath(area: string | null): string {
  const params = new URLSearchParams();
  if (area !== null) params.set('area', area);
  const position = lastKnownPosition();
  if (position !== null) {
    params.set('lat', String(position.lat));
    params.set('lon', String(position.lon));
  }
  const query = params.toString();
  return query.length > 0 ? `/tasks?${query}` : '/tasks';
}

export function TaskList() {
  const router = useRouter();

  const [rows, setRows] = useState<TaskRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [claim, setClaim] = useState<ActiveClaim | null>(null);
  const [error, setError] = useState<{ task_id: string; message: string } | null>(null);
  const [earnings, setEarnings] = useState<number | null>(null);

  // The row the claim belongs to, kept so the pinned card still renders in the moment between
  // claiming and the next poll — and after the poll, if the API stops listing it.
  const claimedRow = useRef<TaskRow | null>(null);
  const area = useRef<string | null>(null);

  // Read through a ref so `poll` never changes identity: a new `poll` would tear down and
  // rebuild the interval on every render, and each rebuild is an extra request.
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    const stored = readActiveClaim();
    if (stored !== null) setClaim(stored);
  }, []);

  useEffect(() => {
    let live = true;
    void resolveArea().then((resolved) => {
      if (live) area.current = resolved;
    });
    return () => {
      live = false;
    };
  }, []);

  const poll = useCallback(async () => {
    try {
      const data = await apiFetch<TasksResponse>(tasksPath(area.current));
      setRows(data.tasks);
      // `TaskCard` clears the stored claim when its countdown hits `00:00`; this is where the
      // pinned card goes away and the worker is back on the list.
      setClaim((current) => (current !== null && readActiveClaim() === null ? null : current));
    } catch (thrown) {
      if (thrown instanceof ApiError && thrown.status === 401) routerRef.current.replace('/');
    }
  }, []);

  useEffect(() => {
    void poll();
    const id = setInterval(() => {
      if (document.hidden) return;
      void poll();
    }, POLL_MS);

    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [poll]);

  useEffect(() => {
    let live = true;
    const read = async () => {
      try {
        const data = await apiFetch<Earnings>('/me/earnings');
        if (live) setEarnings(data.released_usdc);
      } catch {
        // The footer is a readout, not a gate: a failed poll leaves the last figure alone.
      }
    };
    void read();
    const id = setInterval(() => void read(), EARNINGS_POLL_MS);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  const onClaim = useCallback(
    async (row: TaskRow) => {
      setError(null);
      try {
        const response = await apiFetch<ClaimResponse>(`/tasks/${row.task_id}/claim`, {
          method: 'POST',
        });
        const next: ActiveClaim = {
          task_id: row.task_id,
          claim_expires_at: response.claim_expires_at,
          submit_deadline: response.submit_deadline,
          tx: response.tx,
        };
        writeActiveClaim(next);
        claimedRow.current = row;
        setClaim(next);
        setExpandedId(null);
      } catch (thrown) {
        const code = errorCode(thrown);
        setError({ task_id: row.task_id, message: (code && CLAIM_ERRORS[code]) || GENERIC_ERROR });
        // Someone was faster: the list is already wrong, so ask again rather than wait 3 s.
        if (code === 'AlreadyClaimed') void poll();
      }
    },
    [poll],
  );

  const onRelease = useCallback(
    async (task_id: string) => {
      setError(null);
      try {
        await apiFetch<{ tx: string }>(`/tasks/${task_id}/release-claim`, { method: 'POST' });
      } catch {
        // The claim is released locally either way: a claim the API no longer holds is not
        // one this screen should keep pinned.
        setError({ task_id, message: GENERIC_ERROR });
      }
      clearActiveClaim();
      claimedRow.current = null;
      setClaim(null);
      void poll();
    },
    [poll],
  );

  const pinned =
    claim === null
      ? null
      : (rows.find((row) => row.task_id === claim.task_id) ?? claimedRow.current);
  const rest = claim === null ? rows : rows.filter((row) => row.task_id !== claim.task_id);

  return (
    <div data-screen="tasks">
      {claim === null || pinned === null || pinned === undefined ? null : (
        <ul style={{ margin: 0, padding: 0 }}>
          <TaskCard
            claim={claim}
            error={error?.task_id === pinned.task_id ? error.message : undefined}
            expanded
            onClaim={() => void onClaim(pinned)}
            onRelease={() => void onRelease(pinned.task_id)}
            onToggle={() => setExpandedId(null)}
            row={pinned}
          />
        </ul>
      )}

      {rest.length === 0 && claim === null ? (
        <p data-empty="tasks" data-floor="20">
          {EMPTY_STATE}
        </p>
      ) : null}

      <ul style={{ margin: 0, padding: 0 }}>
        {rest.map((row) => (
          <TaskCard
            error={error?.task_id === row.task_id ? error.message : undefined}
            expanded={expandedId === row.task_id}
            key={row.task_id}
            onClaim={() => void onClaim(row)}
            onRelease={() => void onRelease(row.task_id)}
            onToggle={() => setExpandedId((current) => (current === row.task_id ? null : row.task_id))}
            row={row}
          />
        ))}
      </ul>

      <footer
        style={{
          alignItems: 'center',
          borderTop: '1px solid var(--paper-border)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--s-3)',
          marginTop: 'var(--s-6)',
          paddingTop: 'var(--s-4)',
        }}
      >
        <a data-hit="44" href="/earnings" style={{ color: 'var(--ink-text)' }}>
          <span data-earnings="released" data-floor="20">
            {`earnings ${(earnings ?? 0).toFixed(2)} testnet USDC`}
          </span>
        </a>
        <Chip tone="neutral" floor={20}>
          {NOT_SPENDABLE}
        </Chip>
      </footer>
    </div>
  );
}
