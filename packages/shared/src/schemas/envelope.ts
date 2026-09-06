import { z } from 'zod';
import {
  DEFAULT_CLAIM_TTL_S, DEFAULT_DISPUTE_WINDOW_S, DEFAULT_SUBMIT_TTL_S,
  MAX_TASK_AMOUNT_USDC, NEED_BY_MIN_LEAD_S, PRICE_FLOOR_USDC, SPEC_MAX_CHARS,
} from '../constants';
import type { TaskType } from '../enums';
import { canonicalJson } from './spec-hash';
import { CallConfirmSpec, CompareTwoSpec, PhotoOfSpec, VerifyOpenSpec } from './specs';

const twoDecimals = (n: number) => Math.round(n * 100) / 100 === n;

/** The fields every task type shares. Exported for `HireHumanInput`, which spells the same envelope as one object. */
export const EnvelopeCommon = {
  amount_usdc: z.number().positive().max(MAX_TASK_AMOUNT_USDC).refine(twoDecimals, 'at most 2 decimals'),
  need_by: z.iso.datetime().optional(),
  claim_ttl_s: z.number().int().min(60).max(604_800).default(DEFAULT_CLAIM_TTL_S),
  submit_ttl_s: z.number().int().min(60).max(604_800).default(DEFAULT_SUBMIT_TTL_S),
  dispute_window_s: z.number().int().min(60).max(604_800).default(DEFAULT_DISPUTE_WINDOW_S),
  /** A claimed ERC-8004 id. Verified against the registry by the API, never trusted from here. */
  agent_id: z.string().regex(/^\d+$/).optional(),
};

const EnvelopeShape = z.discriminatedUnion('task_type', [
  z.object({ task_type: z.literal('verify-open'), spec: VerifyOpenSpec, ...EnvelopeCommon }),
  z.object({ task_type: z.literal('photo-of'), spec: PhotoOfSpec, ...EnvelopeCommon }),
  z.object({ task_type: z.literal('call-confirm'), spec: CallConfirmSpec, ...EnvelopeCommon }),
  z.object({ task_type: z.literal('compare-two'), spec: CompareTwoSpec, ...EnvelopeCommon }),
]);

/**
 * The common envelope of `POST /tasks` and `hire_human`. Built by a factory so tests can pin
 * the clock; `Envelope` below uses the real one.
 */
export function makeEnvelope(now: () => number = () => Date.now()) {
  return EnvelopeShape.superRefine((e, ctx) => {
    const floor = PRICE_FLOOR_USDC[e.task_type as TaskType];
    if (e.amount_usdc < floor) {
      ctx.addIssue({ code: 'custom', path: ['amount_usdc'], message: `${e.task_type} pays at least ${floor.toFixed(2)} USDC` });
    }
    const serialized = canonicalJson(e.spec);
    if (serialized.length > SPEC_MAX_CHARS) {
      ctx.addIssue({ code: 'custom', path: ['spec'], message: `serialized spec is ${serialized.length} chars; the cap is ${SPEC_MAX_CHARS}` });
    }
    if (e.need_by) {
      const lead = (Date.parse(e.need_by) - now()) / 1000;
      if (lead < NEED_BY_MIN_LEAD_S) {
        ctx.addIssue({ code: 'custom', path: ['need_by'], message: `need_by must be at least ${NEED_BY_MIN_LEAD_S / 60} minutes in the future` });
      }
    }
  });
}

export const Envelope = makeEnvelope();
export type Envelope = z.infer<typeof Envelope>;
export type EnvelopeInput = z.input<typeof Envelope>;
