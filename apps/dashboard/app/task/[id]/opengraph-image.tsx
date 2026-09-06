import { fromUsdcUnits, toUsdcUnits } from '@legwork/shared';
import { ImageResponse } from 'next/og';
import { getDemoTaskReceipt, getTaskReceipt, resolveDataMode } from '../../../lib/data';
import { featuredStateOf } from '../../../lib/data/live';
import { shortHash, usdc } from '../../../lib/format';

export const alt = 'Legwork — task receipt';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const INK_900 = '#0d0f0e';
const INK_800 = '#151816';
const BORDER_1 = '#262c28';
const FG_1 = '#f1efe9';
const FG_3 = '#8b918d';
const VERIFIED = '#35c79a';
const REFUSAL = '#e4a33f';

/*
 * Drawn with glyphs the bundled font already covers, so `@vercel/og` never downloads
 * one and the build makes no network request. No check mark, no arrow below.
 *
 * The card carries the state and its amounts and nothing else a link preview has no
 * business unfurling: never the thumbnail, never the coordinate, never the answer.
 *
 * §2 spells the proof line `proof (check mark) <shortHash>`; the check mark is one of
 * the glyphs this build may not draw, so the line says it in words instead. Flagged in
 * the PR — the alternative is a font download at build time, and CI has no network.
 */
export default async function TaskOpengraphImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const receipt =
    resolveDataMode(process.env.DATA_MODE) === 'demo'
      ? getDemoTaskReceipt(id)
      : await getTaskReceipt(id);

  const task = receipt?.task;
  const state = task ? featuredStateOf(task.status, task.tx.release) : 'locked';
  const amount = task?.amount_usdc ?? 0;
  const fee = task?.fee_usdc ?? 0;
  const agentPays = fromUsdcUnits(toUsdcUnits(amount) + toUsdcUnits(fee));
  const released = state === 'released';
  const stateWord = released
    ? 'RELEASED'
    : state === 'refunded'
      ? 'REFUNDED'
      : state === 'submitted'
        ? 'SUBMITTED'
        : 'LOCKED';
  const accent = released ? VERIFIED : FG_1;
  const proofOk = task?.proof?.hash_ok === true ? task.proof.hash : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: INK_900,
          padding: 64,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', fontSize: 40, fontWeight: 800, letterSpacing: 4, color: FG_1 }}>
            LEGWORK
          </div>
          <div style={{ display: 'flex', fontSize: 30, color: FG_3 }}>task #{id}</div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            background: INK_800,
            border: `2px solid ${BORDER_1}`,
            borderRadius: 16,
            padding: 40,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 24 }}>
            <div style={{ display: 'flex', fontSize: 64, fontWeight: 800, color: accent }}>
              {stateWord}
            </div>
            <div style={{ display: 'flex', fontSize: 110, fontWeight: 800, color: accent }}>
              {usdc(released ? amount : agentPays)}
            </div>
          </div>
          {released ? (
            <div style={{ display: 'flex', fontSize: 30, color: VERIFIED }}>
              to worker · agent paid {usdc(agentPays)} · fee {usdc(fee)}
            </div>
          ) : (
            <div style={{ display: 'flex', fontSize: 30, color: FG_3 }}>
              agent paid {usdc(agentPays)} · posted rate {usdc(amount)} · fee {usdc(fee)}
            </div>
          )}
          {proofOk ? (
            <div style={{ display: 'flex', fontSize: 30, color: VERIFIED }}>
              proof hash matches onchain · {shortHash(proofOk)}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', fontSize: 26, color: FG_3 }}>
            bounded, attributable work · Base Sepolia · USDC · testnet USDC — not spendable
          </div>
          {receipt === null ? (
            <div style={{ display: 'flex', fontSize: 26, color: REFUSAL }}>receipt unavailable</div>
          ) : null}
        </div>
      </div>
    ),
    size,
  );
}
