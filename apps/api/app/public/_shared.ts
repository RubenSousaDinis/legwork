// OWNER: T-19
/**
 * What a stranger is allowed to see.
 *
 * Every object here is assembled field by field. Spreading a task row would be one keystroke
 * and would publish every private column the schema marks as such — the raw spec, the exact
 * coordinate, the buyer token digest, the payer, the agent id and the payment nonce — so the
 * allowlist is not a style preference, it is the privacy control. A public coordinate is
 * always the rounded one; a public answer is the enum, never the worker's note; a public
 * proof never carries a URL.
 */
import { getConfig } from '@/src/config';
import {
  answerOf,
  proofDeps,
  statusOf,
  taskTypeName,
  txSetOf,
  type ProofRow,
  type TaskRow,
  type TxSet,
} from '@/src/services/statusBus';
import { fromUsdcUnits, type TaskType } from '@legwork/shared';

/** Base Sepolia's explorer. Every hash on a public surface is a link somebody can follow. */
export const EXPLORER_TX = 'https://sepolia.basescan.org/tx/';

export const PUBLIC_RATE_LIMIT = { limit: 60, windowS: 60 } as const;
export const PUBLIC_CACHE_CONTROL = 'public, max-age=5';

export interface PublicProofView {
  hash: string;
  hash_ok: boolean;
  captured_at: string;
  coordinate_rounded?: { lat: number; lon: number };
  gps_unavailable: boolean;
}

export interface PublicTaskView {
  task_id: string;
  state: string;
  task_type: TaskType;
  /** The posted rate the worker keeps: 3.00. The dashboard renders `3.00 + 0.45 = 3.45`. */
  price_usdc: number;
  fee_usdc: number;
  area: string;
  seeded: boolean;
  posted_at: string;
  claimed_at?: string;
  submitted_at?: string;
  released_at?: string;
  answer?: string;
  proof?: PublicProofView;
  tx: TxSet;
  links: TxSet;
  dashboard_url: string;
}

/** A response every public route shares: cheap to cache, never a private byte in it. */
export function publicJson(body: unknown): Response {
  return Response.json(body, { headers: { 'cache-control': PUBLIC_CACHE_CONTROL } });
}

function linksOf(tx: TxSet): TxSet {
  return Object.fromEntries(
    Object.entries(tx).map(([key, hash]) => [key, `${EXPLORER_TX}${hash}`]),
  ) as TxSet;
}

export async function publicTaskView(
  row: TaskRow,
  proofRow: ProofRow | null,
): Promise<PublicTaskView> {
  const tx = txSetOf(row);

  let proof: PublicProofView | undefined;
  if (row.proofHash && proofRow) {
    const hasGps =
      !proofRow.gpsUnavailable && proofRow.exactLat !== null && proofRow.exactLon !== null;
    proof = {
      hash: row.proofHash,
      // Re-hashed here, at response time, on every request. A `hash_ok` read from a column
      // would be a claim about a check somebody ran once.
      hash_ok: await proofDeps.rehash(row.proofHash),
      captured_at: proofRow.capturedAt.toISOString(),
      ...(hasGps
        ? {
            coordinate_rounded: proofDeps.round100m(
              Number(proofRow.exactLat),
              Number(proofRow.exactLon),
            ),
          }
        : {}),
      gps_unavailable: proofRow.gpsUnavailable,
    };
  }

  return {
    task_id: row.taskId.toString(),
    state: statusOf(row),
    task_type: taskTypeName(row.taskType),
    price_usdc: fromUsdcUnits(row.amountUnits),
    fee_usdc: fromUsdcUnits(row.feeUnits),
    area: row.area,
    seeded: row.seeded,
    posted_at: row.postedAt.toISOString(),
    ...(row.claimedAt ? { claimed_at: row.claimedAt.toISOString() } : {}),
    ...(row.submittedAt ? { submitted_at: row.submittedAt.toISOString() } : {}),
    ...(row.releasedAt ? { released_at: row.releasedAt.toISOString() } : {}),
    // The enum only, and only once the worker has answered. The note is the buyer's to
    // read, wrapped as untrusted data; it is never on a public surface.
    ...(answerOf(row) ? { answer: answerOf(row)?.answer } : {}),
    ...(proof ? { proof } : {}),
    tx,
    links: linksOf(tx),
    dashboard_url: `${getConfig().DASHBOARD_URL ?? 'http://localhost:3000'}/task/${row.taskId.toString()}`,
  };
}
