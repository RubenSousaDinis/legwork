import { PUBLIC_COORD_DECIMALS } from '@legwork/shared';
import { Chip } from '../../../components/Chip';
import { MonoTag } from '../../../components/MonoTag';
import { StatusBadge } from '../../../components/StatusBadge';
import { basescanTx, coord, shortHash, usdc } from '../../../lib/format';
import { featuredStateOf } from '../../../lib/data/live';
import type { TaskReceipt } from '../../../lib/data/receipt';
import type { DataMode } from '../../../lib/data/types';
import './receipt.css';

/**
 * The receipt an external builder's agent hands its principal through `dashboard_url`.
 * Presentational only — every value below is read off the `TaskView` the route already
 * fetched, and the `?t=` buyer token never reaches this component.
 *
 * Rule (2) lives here: a RELEASED line always has a proof reference beside it, either
 * the proof block or the submit tx link labelled `proof hash onchain ↗`.
 */

export interface ReceiptProps {
  task: TaskReceipt['task'];
  seeded: boolean | null;
  dataMode: DataMode;
}

const TX_LABELS = [
  ['post', 'post ↗'],
  ['claim', 'claim ↗'],
  ['submit', 'submit ↗'],
  ['release', 'release ↗'],
] as const;

const TIMELINE = [
  ['posted_at', 'posted'],
  ['claimed_at', 'claimed'],
  ['submitted_at', 'submitted'],
  ['released_at', 'released'],
] as const;

/** A phone call can only ever be a self-report, and every surface has to say so. */
const CALL_CONFIRM_DISCLOSURE = 'self-reported answer + timestamp (unverified)';

function answerText(answer: unknown): string | null {
  if (typeof answer === 'string') return answer;
  if (answer && typeof answer === 'object' && 'answer' in answer) {
    const inner = (answer as { answer: unknown }).answer;
    if (typeof inner === 'string') return inner;
  }
  return null;
}

export function Receipt({ task, seeded, dataMode }: ReceiptProps) {
  const fee = task.fee_usdc;
  const amount = task.amount_usdc;
  // A sum, never a subtraction: the fee is charged on top of the posted rate.
  const agentPays = Number((amount + fee).toFixed(2));
  const money = featuredStateOf(task.status, task.tx.release);
  const proof = task.proof;
  const answer = answerText(task.answer);
  const gpsUnavailable = proof?.gps_unavailable === true;

  return (
    <main className="receipt" data-testid="receipt" data-mode={dataMode} data-status={task.status}>
      <header className="receipt-head card">
        <div className="receipt-head-row">
          <span className="mono receipt-id">task #{task.task_id}</span>
          <StatusBadge status={task.status} />
          <MonoTag type={task.task_type} />
        </div>
        {/*
          Honesty chips are brand elements and sit in the header, above the fold on a
          phone — never in the footer, and never fine print.
        */}
        <div className="receipt-chips">
          {dataMode === 'demo' ? <Chip tone="demo">DEMO DATA</Chip> : null}
          {seeded === true ? <Chip tone="seeded">seeded</Chip> : null}
          {gpsUnavailable ? <Chip tone="neutral">GPS unavailable in webview — disclosed</Chip> : null}
        </div>
        {/* Rule (9): a flag we could not read is said out loud, never assumed false. */}
        {seeded === null ? <p className="mono receipt-note">seeded status unavailable</p> : null}
      </header>

      <section className="receipt-money card">
        <div className="section-label">escrow</div>
        <p className="receipt-money-line">
          {money === 'released' ? (
            <>
              <span className="receipt-state">RELEASED</span>{' '}
              <span className="numeral receipt-amount">{usdc(amount)}</span>
              <span className="receipt-tail">
                {' → worker · +'}
                {usdc(fee)} fee
              </span>
            </>
          ) : money === 'refunded' ? (
            <>
              <span className="receipt-state">REFUNDED</span>{' '}
              <span className="numeral receipt-amount">{usdc(agentPays)}</span>
              <span className="receipt-tail">{' → buyer'}</span>
            </>
          ) : (
            <>
              <span className="receipt-state">LOCKED</span>{' '}
              <span className="numeral receipt-amount">{usdc(agentPays)}</span>
            </>
          )}
        </p>
        <p className="mono receipt-money-note">
          agent paid {usdc(agentPays)} · posted rate {usdc(amount)} · fee {usdc(fee)}
        </p>
      </section>

      {proof ? (
        <section className="receipt-proof card">
          <div className="section-label">proof</div>
          <p className="mono receipt-hash">{proof.hash}</p>
          {/*
            Strictly `=== true`: an absent or unknown `hash_ok` is not a match, and a
            re-hash that failed says so instead of going quiet.
          */}
          {proof.hash_ok === true ? (
            <p className="receipt-hash-ok">hash matches onchain ✓</p>
          ) : null}
          {proof.hash_ok === false ? (
            <p className="receipt-hash-bad">hash does not match onchain — not verified</p>
          ) : null}

          {proof.url ? (
            <figure className="receipt-thumb">
              {/*
                A plain `img`, not `next/image`: the source is a signed, expiring URL
                into a private bucket, and routing it through the optimizer would put a
                buyer-gated photo in a shared cache.
              */}
              <img src={proof.url} alt="proof photo" width={320} height={240} />
              <figcaption className="mono">buyer-gated thumbnail · signed URL</figcaption>
            </figure>
          ) : (
            <p className="mono receipt-note">thumbnail gated — buyer only</p>
          )}

          <p className="mono receipt-note">captured {proof.captured_at}</p>
          {proof.coordinate_rounded ? (
            <p className="mono receipt-coord">
              {coord(proof.coordinate_rounded.lat, proof.coordinate_rounded.lon)}
            </p>
          ) : null}
        </section>
      ) : money === 'released' && task.tx.submit ? (
        // Rule (2): the released line never stands without a proof reference beside it.
        <section className="receipt-proof card">
          <div className="section-label">proof</div>
          <a
            className="mono receipt-tx"
            data-hit="44"
            href={basescanTx(task.tx.submit)}
            target="_blank"
            rel="noreferrer"
          >
            proof hash onchain ↗ {shortHash(task.tx.submit)}
          </a>
        </section>
      ) : null}

      {answer !== null ? (
        <section className="receipt-answer card">
          <div className="section-label">answer</div>
          <p className="receipt-answer-line">answer: {answer}</p>
          <p className="mono receipt-note">
            worker-reported · untrusted
            {task.task_type === 'call-confirm' ? ` · ${CALL_CONFIRM_DISCLOSURE}` : ''}
          </p>
        </section>
      ) : null}

      <section className="receipt-tx-block card">
        <div className="section-label">transactions</div>
        <ul className="receipt-tx-list">
          {TX_LABELS.map(([key, label]) => {
            const hash = task.tx[key];
            if (!hash) return null;
            return (
              <li key={key}>
                <a
                  className="mono receipt-tx"
                  data-hit="44"
                  href={basescanTx(hash)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {label} {shortHash(hash)}
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="receipt-timeline card">
        <div className="section-label">timeline</div>
        <ul className="receipt-timeline-list">
          {TIMELINE.map(([key, label]) => {
            const at = task[key];
            if (!at) return null;
            return (
              <li key={key} className="mono">
                {label} {at}
              </li>
            );
          })}
        </ul>
        {/* A geohash-5 and nothing finer: the exact coordinate never leaves the record. */}
        <p className="mono receipt-note">area {task.area}</p>
      </section>

      <footer className="receipt-foot">
        <Chip tone="neutral">Base Sepolia · USDC</Chip>
        <Chip tone="neutral">testnet USDC — not spendable</Chip>
        {task.tx.claim ? <Chip tone="neutral">relayed claim · gas paid by Legwork</Chip> : null}
      </footer>

      {/* The rounding is the frozen constant, said out loud once. */}
      <p className="mono receipt-fineprint">
        public surfaces round a coordinate to {PUBLIC_COORD_DECIMALS} decimals
      </p>
    </main>
  );
}
