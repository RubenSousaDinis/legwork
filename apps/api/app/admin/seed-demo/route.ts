// OWNER: T-19 / T-63
/**
 * Put the demo-data rows and the international seed catalog on the wall so a cold database
 * is not an empty screenshot.
 *
 * Every row lands with `seeded = true`. A seeded task is never shown as a real one and never
 * moved money: `tx_post` is `demo-data.json`'s own placeholder, not a hash of anything. The
 * refused row of the feed is not a task — a refusal moves no money and posts nothing — so it
 * is served by `/public/refusals` as an example instead.
 *
 * Idempotent: the ids are derived from the row's position, so running it twice inserts 0.
 */
import { inArray } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import {
  DEFAULT_CLAIM_TTL_S, DEFAULT_SUBMIT_TTL_S, DemoData, TASK_TYPE_BIT, ZERO_ADDRESS,
  feeOn, priceWithFee, toUsdcUnits,
} from '@legwork/shared';
import { getConfig } from '@/src/config';
import { getDb } from '@/src/db/client';
import { tasks } from '@/src/db/schema';
import { newBuyerToken } from '@/src/services/buyerToken';
import { areaOf, loadCatalog } from '@/src/seed/catalog';
import { audited, preflight, type AdminResult } from '../_shared';
import demoDataJson from '../../../../../demo-data.json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Parsed, not trusted: a malformed `demo-data.json` fails here rather than on the wall. */
const demo = DemoData.parse(demoDataJson);

/** Far above anything `POST /tasks` mints, so a seeded id can never collide with a real one. */
const SEED_ID_BASE = 9_000_000n;
/** Catalog rows sit above the three legacy demo ids (9000001–9000003). */
const CATALOG_ID_BASE = 9_000_100n;

/** Geohash-5 of Leiria's centre (39.744, -8.807) — the locality `demo-data.json` names. */
const DEMO_AREA = 'ez1dp';

/** How long ago each legacy seeded row was "posted", so the feed has an order to render. */
const AGE_S = [3600, 2400, 1200, 600];

export const POST = audited('/admin/seed-demo', async (): Promise<AdminResult> => {
  const db = getDb();
  const config = getConfig();
  const catalog = loadCatalog();

  // A refused task never existed; only the four states the escrow knows are seeded.
  const seedable = demo.feed.filter((row) => row.status !== 'refused');
  const legacyIds = seedable.map((_, i) => SEED_ID_BASE + BigInt(i + 1));
  const catalogIds = catalog.map((_, i) => CATALOG_ID_BASE + BigInt(i + 1));
  const ids = [...legacyIds, ...catalogIds];

  const present = new Set(
    (await db.select({ taskId: tasks.taskId }).from(tasks).where(inArray(tasks.taskId, ids))).map(
      (r) => r.taskId.toString(),
    ),
  );

  const now = Date.now();
  const legacyRows = seedable
    .map((row, i) => ({ row, taskId: legacyIds[i] as bigint, index: i }))
    .filter(({ taskId }) => !present.has(taskId.toString()))
    .map(({ row, taskId, index }) => {
      const amountUnits = toUsdcUnits(row.amount_usdc);
      const postedAt = new Date(now - (AGE_S[index] ?? 600) * 1000);
      const claimed = row.status !== 'open';
      const submitted = row.status === 'submitted' || row.status === 'released';
      return {
        taskId,
        taskType: TASK_TYPE_BIT[row.task_type],
        specHash: `0x${createHash('sha256').update(`demo-seed:${taskId}`).digest('hex')}`,
        amountUnits,
        feeUnits: feeOn(amountUnits),
        priceUnits: priceWithFee(amountUnits),
        buyer: ZERO_ADDRESS,
        area: DEMO_AREA,
        state: row.status,
        postedAt,
        claimedAt: claimed ? new Date(postedAt.getTime() + 120_000) : null,
        submittedAt: submitted ? new Date(postedAt.getTime() + 480_000) : null,
        releasedAt: row.status === 'released' ? new Date(postedAt.getTime() + 600_000) : null,
        claimTtlS: DEFAULT_CLAIM_TTL_S,
        submitTtlS: DEFAULT_SUBMIT_TTL_S,
        disputeWindowS: config.DEMO_DISPUTE_WINDOW_S,
        seeded: true,
        txPost: demo.tx_placeholder,
        specJson: { seeded: true, locality: demo.place.locality },
        buyerTokenHash: newBuyerToken().hash,
        payer: ZERO_ADDRESS,
      };
    });

  const catalogRows = catalog
    .map((row, i) => ({ row, taskId: catalogIds[i] as bigint }))
    .filter(({ taskId }) => !present.has(taskId.toString()))
    .map(({ row, taskId }) => {
      const amountUnits = toUsdcUnits(row.amount_usdc);
      const postedAt = new Date(now - row.posted_ago_s * 1000);
      return {
        taskId,
        taskType: TASK_TYPE_BIT[row.task_type],
        specHash: `0x${createHash('sha256').update(`demo-seed:${taskId}`).digest('hex')}`,
        amountUnits,
        feeUnits: feeOn(amountUnits),
        priceUnits: priceWithFee(amountUnits),
        buyer: ZERO_ADDRESS,
        area: areaOf(row),
        state: 'open' as const,
        postedAt,
        claimTtlS: DEFAULT_CLAIM_TTL_S,
        submitTtlS: DEFAULT_SUBMIT_TTL_S,
        disputeWindowS: config.DEMO_DISPUTE_WINDOW_S,
        seeded: true,
        txPost: demo.tx_placeholder,
        specJson: row.spec,
        buyerTokenHash: newBuyerToken().hash,
        payer: ZERO_ADDRESS,
        exactLat: row.exact ? String(row.exact.lat) : null,
        exactLon: row.exact ? String(row.exact.lon) : null,
      };
    });

  const rows = [...legacyRows, ...catalogRows];
  if (rows.length > 0) await db.insert(tasks).values(rows);

  return new Response(JSON.stringify({ ok: true, inserted: rows.length }), {
    headers: { 'content-type': 'application/json' },
  });
});

export const OPTIONS = preflight;
