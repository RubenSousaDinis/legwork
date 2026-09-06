import type { TaskType } from '@legwork/shared';
import { Chip } from './ui/Chip';
import { MonoTag } from './ui/MonoTag';

/**
 * What a visitor sees on `/tasks` before they verify: the real list, at the real prices,
 * behind one banner. Nothing is blurred and nothing is invented — a stranger can read the
 * offer, decide it is worth a minute of World ID, and only then be asked for it.
 *
 * The component is pure props. It reads no session, fetches nothing and knows no route: the
 * caller (T-25's `app/tasks/page.tsx`) decides there is no session, hands over the open rows
 * of `GET /public/feed` with `amount_usdc` mapped to `price_usdc`, and mounts it first.
 *
 * The price shown is the worker's rate. The agent pays 3.45, escrow locks 3.45, the worker
 * receives the posted 3.00 and the 0.45 fee rides on top of it; the agent's price never
 * reaches the phone and nothing here subtracts anything from anything.
 */

export const VERIFY_HEADING = 'Verify to claim';
export const REAL_PRICES_LINE = 'real tasks, real prices — verification takes about a minute';
export const VERIFY_CTA = 'Verify with World ID';
export const NO_OPEN_TASKS = 'no open tasks right now';

/** One open row of `GET /public/feed`, narrowed to what a locked list can honestly show. */
export type UnverifiedTask = {
  task_id: string;
  task_type: TaskType;
  title: string;
  price_usdc: number;
  /** Rule (9): a seeded row says so wherever it renders. The caller passes it through. */
  seeded?: boolean;
};

export type UnverifiedBannerProps = {
  tasks: UnverifiedTask[];
  /** Where `Verify with World ID` goes; `/` is the auth screen. */
  verifyHref?: string;
};

export function UnverifiedBanner({ tasks, verifyHref = '/' }: UnverifiedBannerProps) {
  return (
    <div data-screen="unverified">
      <div
        className="lw-card"
        data-banner="verify"
        style={{ borderColor: 'var(--verified-border-light)', marginBottom: 'var(--s-4)' }}
      >
        <p
          data-floor="20"
          style={{
            color: 'var(--verified-700)',
            fontSize: '20px',
            fontWeight: 600,
            margin: '0 0 var(--s-2)',
          }}
        >
          {VERIFY_HEADING}
        </p>
        <p style={{ fontSize: '16px', margin: '0 0 var(--s-4)' }}>{REAL_PRICES_LINE}</p>

        {/* The button classes on the anchor itself — a `Button` inside a link would be two
            nested interactive elements over one 44 px target (T-33 does the same on its
            `Back to tasks` link). */}
        <a
          className="lw-button lw-button--verified lw-button--full"
          data-cta="verify"
          data-hit="44"
          href={verifyHref}
          style={{ textDecoration: 'none' }}
        >
          {VERIFY_CTA}
        </a>
      </div>

      {tasks.length === 0 ? (
        <p data-empty="tasks" style={{ fontSize: '16px', margin: 0 }}>
          {NO_OPEN_TASKS}
        </p>
      ) : (
        <ul style={{ display: 'grid', gap: 'var(--s-3)', listStyle: 'none', margin: 0, padding: 0 }}>
          {tasks.map((task) => (
            <li className="lw-card" data-task={task.task_id} key={task.task_id}>
              <p
                style={{
                  alignItems: 'center',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 'var(--s-2)',
                  margin: '0 0 var(--s-2)',
                }}
              >
                <MonoTag>{task.task_type}</MonoTag>
                {task.seeded === true ? (
                  <Chip tone="seeded" floor={20}>
                    seeded
                  </Chip>
                ) : null}
              </p>

              <p style={{ fontSize: '16px', margin: '0 0 var(--s-3)' }}>{task.title}</p>

              <p
                data-price={task.task_id}
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '24px',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  margin: '0 0 var(--s-3)',
                }}
              >
                {`${task.price_usdc.toFixed(2)} USDC`}
              </p>

              {/* Disabled, and said twice: `disabled` stops the tap, `aria-disabled` says why
                  out loud. The `Button` primitive is T-24's and takes no ARIA prop, so the
                  row uses its classes directly rather than restyling it — the same move
                  T-33's `Segmented` and `Back to tasks` make. */}
              <button
                aria-disabled="true"
                className="lw-button lw-button--ghost"
                data-hit="44"
                disabled
                type="button"
              >
                {VERIFY_HEADING}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
