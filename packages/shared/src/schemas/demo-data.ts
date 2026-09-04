import { z } from 'zod';
import { ABUSE_CLASSES, TASK_TYPES } from '../enums.js';

/**
 * Shape of `demo-data.json`. Drives dev/CI screenshots only and renders a visible
 * "DEMO DATA" chip; the filmed URL runs `DATA_MODE=live`.
 */
export const DemoData = z.object({
  place: z.object({
    place_id: z.string().regex(/^(node|way|relation)\/\d+$/),
    name: z.string(), street_address: z.string(), locality: z.literal('Leiria'), country: z.literal('PT'),
  }),
  worker: z.object({ handle: z.literal('#w-0417'), verified: z.literal(true), credential: z.enum(['sandbox World ID', 'sandbox Selfie Check']) }),
  agent: z.object({ handle: z.literal('#8004-1207'), erc8004_id: z.literal(1207) }),
  money: z.object({
    agent_pays: z.literal(3.45), escrow_locked: z.literal(3.45), worker_receives: z.literal(3.0), fee: z.literal(0.45),
  }),
  feed: z.array(z.object({
    task_type: z.enum(TASK_TYPES),
    status: z.enum(['open', 'claimed', 'submitted', 'released', 'refused']),
    seeded: z.boolean(),
    amount_usdc: z.number(),
    refusal_class: z.enum(ABUSE_CLASSES).optional(),
    via: z.enum(['x402', 'hire_human']).optional(),
  })).length(4),
  worker_pool: z.object({ real: z.literal(1), seeded: z.literal(20) }),
  preflight: z.object({
    active: z.literal(4), verified: z.literal(1), seeded: z.literal(3),
    score_floor: z.literal(4.2), median_minutes: z.literal(9), median_source: z.literal('seeded'),
  }),
  chips: z.array(z.string()),
  narrationVariant: z.enum(['A', 'B']),
  tx_placeholder: z.literal('0x8f2a…c41d'),
});
export type DemoData = z.infer<typeof DemoData>;

/** The one string every pool headline renders. Never any other total. */
export function poolString(real: number, seeded: number): string {
  return `${real} real · +${seeded} seeded (demo data)`;
}
