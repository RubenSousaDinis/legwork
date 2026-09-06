/**
 * Every table the API will ever use, pre-declared in T-01b. Frozen: agents never edit this
 * file. Tasks own the columns they write; nothing here is created lazily.
 *
 * Privacy split: the exact coordinate, the raw spec, the buyer token hash, the payer and the
 * agent id live only in the columns marked private and are never selected into a public view.
 */
import { sql } from 'drizzle-orm';
import {
  bigint, boolean, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex,
} from 'drizzle-orm/pg-core';

export const tasks = pgTable('tasks', {
  taskId: bigint('task_id', { mode: 'bigint' }).primaryKey(),
  // -- public, mirroring the on-chain Task --
  taskType: integer('task_type').notNull(),
  specHash: text('spec_hash').notNull(),
  amountUnits: bigint('amount_units', { mode: 'bigint' }).notNull(),
  feeUnits: bigint('fee_units', { mode: 'bigint' }).notNull(),
  buyer: text('buyer').notNull(),
  buyerAgentId: text('buyer_agent_id'),
  area: text('area').notNull(),
  worker: text('worker'),
  state: text('state').notNull(),
  postedAt: timestamp('posted_at', { withTimezone: true }).notNull(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  releasedAt: timestamp('released_at', { withTimezone: true }),
  proofHash: text('proof_hash'),
  claimTtlS: integer('claim_ttl_s').notNull(),
  submitTtlS: integer('submit_ttl_s').notNull(),
  disputeWindowS: integer('dispute_window_s').notNull(),
  seeded: boolean('seeded').notNull().default(false),
  answer: text('answer'),
  note: text('note'),
  disputeReason: text('dispute_reason'),
  autoDisputeReason: text('auto_dispute_reason'),
  txPost: text('tx_post'),
  txClaim: text('tx_claim'),
  txSubmit: text('tx_submit'),
  txRelease: text('tx_release'),
  // -- private: never in a public response --
  specJson: jsonb('spec_json').notNull(),
  buyerTokenHash: text('buyer_token_hash').notNull(),
  exactLat: numeric('exact_lat'),
  exactLon: numeric('exact_lon'),
  agentId: text('agent_id'),
  payer: text('payer').notNull(),
  authNonce: text('auth_nonce'),
  priceUnits: bigint('price_units', { mode: 'bigint' }).notNull(),
  floatAbsorbed: boolean('float_absorbed').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('tasks_state_idx').on(t.state), index('tasks_area_idx').on(t.area), index('tasks_payer_idx').on(t.payer)]);

export const proofs = pgTable('proofs', {
  hash: text('hash').primaryKey(),
  storageKey: text('storage_key').notNull(),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
  exactLat: numeric('exact_lat'),
  exactLon: numeric('exact_lon'),
  exactAccuracyM: numeric('exact_accuracy_m'),
  gpsUnavailable: boolean('gps_unavailable').notNull().default(false),
  worker: text('worker').notNull(),
  taskId: bigint('task_id', { mode: 'bigint' }),
  placeId: text('place_id'),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  worker: text('worker').notNull(),
  nullifier: text('nullifier').notNull(),
  mode: text('mode').notNull(), // walletAuth | idkit | dev
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const idkitSessions = pgTable('idkit_sessions', {
  id: text('id').primaryKey(),
  nullifier: text('nullifier').notNull(),
  level: text('level').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

/** One human, one registration. NUMERIC(78,0) holds a full uint256. */
export const nullifiers = pgTable('nullifiers', {
  nullifier: numeric('nullifier', { precision: 78, scale: 0 }).primaryKey(),
  action: text('action').notNull(),
  /**
   * `null` between `/idkit/verify` and `/register`: the human is verified, the row holds the
   * nullifier, and no address is bound yet. The unique index still allows one address per
   * human — Postgres treats NULLs as distinct in a unique btree.
   */
  worker: text('worker'),
  registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('nullifiers_worker_uq').on(t.worker)]);

/** x402 replay protection: one authorization nonce, one task. */
export const idempotency = pgTable('idempotency', {
  authNonce: text('auth_nonce').primaryKey(),
  taskId: bigint('task_id', { mode: 'bigint' }),
  settleTx: text('settle_tx'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Never the raw spec. */
export const screeningLog = pgTable('screening_log', {
  id: text('id').primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  taskType: text('task_type').notNull(),
  class: text('class'),
  reason: text('reason').notNull(),
  ruleId: text('rule_id').notNull(),
  specHash: text('spec_hash').notNull(),
  marked: boolean('marked').notNull().default(false),
  markTx: text('mark_tx'),
  agentId: text('agent_id'),
  payer: text('payer'),
});

export const capsLedger = pgTable('caps_ledger', {
  payer: text('payer').notNull(),
  day: text('day').notNull(), // YYYY-MM-DD UTC
  openTasks: integer('open_tasks').notNull().default(0),
  dailyUnits: bigint('daily_units', { mode: 'bigint' }).notNull().default(sql`0`),
}, (t) => [primaryKey({ columns: [t.payer, t.day] })]);

export const marksLog = pgTable('marks_log', {
  id: text('id').primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  payer: text('payer').notNull(),
  agentIdClaimed: text('agent_id_claimed'),
  agentId: text('agent_id'),
  class: text('class').notNull(),
  specHash: text('spec_hash').notNull(),
  outcome: text('outcome').notNull(), // marked | no_identity | not_owner | already_marked | cooldown | tx_failed
  tx: text('tx'),
});

export const observations = pgTable('observations', {
  observationId: text('observation_id').primaryKey(),
  placeKey: text('place_key').notNull(),
  claimType: text('claim_type').notNull(),
  claimValue: text('claim_value').notNull(),
  evidenceHash: text('evidence_hash'),
  workerNullifier: text('worker_nullifier').notNull(), // private
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
  confidence: numeric('confidence'),
  taskId: bigint('task_id', { mode: 'bigint' }).notNull(),
  seeded: boolean('seeded').notNull().default(false),
  geohash5: text('geohash5').notNull(),
}, (t) => [index('observations_place_idx').on(t.placeKey)]);

export const posters = pgTable('posters', {
  payer: text('payer').primaryKey(),
  agentId: text('agent_id'),
  firstSeen: timestamp('first_seen', { withTimezone: true }).notNull().defaultNow(),
  allowlisted: boolean('allowlisted').notNull().default(false),
});

export const adminAudit = pgTable('admin_audit', {
  id: text('id').primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  action: text('action').notNull(),
  payload: jsonb('payload'),
  tx: text('tx'),
});

/** TxQueue's per-role nonce row; the advisory lock key is derived from key_role. */
export const nonces = pgTable('nonces', {
  keyRole: text('key_role').primaryKey(),
  nextNonce: bigint('next_nonce', { mode: 'bigint' }).notNull(),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
});

/** PAYMENT_MODE=direct only (T-16b). */
export const directQuotes = pgTable('direct_quotes', {
  specHash: text('spec_hash').primaryKey(),
  payer: text('payer').notNull(),
  postParamsJson: jsonb('post_params_json').notNull(),
  totalUnits: bigint('total_units', { mode: 'bigint' }).notNull(),
  deadline: timestamp('deadline', { withTimezone: true }).notNull(),
  taskId: bigint('task_id', { mode: 'bigint' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
