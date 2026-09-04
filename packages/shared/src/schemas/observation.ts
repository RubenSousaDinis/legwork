import { z } from 'zod';

export const CLAIM_TYPES = ['open_now', 'hours', 'item_in_stock', 'price', 'payment', 'reservation', 'photo'] as const;

/**
 * Confidence rule (v0, stated in 10-schemas §8): verified human + photo + GPS inside the fence
 * + inside the TTLs → 0.9; GPS downgraded → 0.6; call-confirm (self-reported) → 0.5;
 * compare-two → n/a (judgement, not observation); any seeded row → 0 and excluded from every
 * aggregate.
 */
export const CONFIDENCE = { full: 0.9, gpsDowngraded: 0.6, selfReported: 0.5, notApplicable: null, seeded: 0 } as const;

const ObservationBase = z.object({
  observation_id: z.string().min(1).max(64),
  place_key: z.string().regex(/^(node|way|relation)\/\d+$/),
  claim: z.object({ type: z.enum(CLAIM_TYPES), value: z.string().max(120) }),
  evidence_hash: z.string().regex(/^0x[0-9a-f]{64}$/).nullable(),
  worker_nullifier: z.string().regex(/^0x[0-9a-f]{1,64}$/),
  observed_at: z.iso.datetime(),
  confidence: z.union([z.literal(0.9), z.literal(0.6), z.literal(0.5), z.literal(0)]).nullable(),
  task_id: z.string().min(1),
  seeded: z.boolean(),
});

export const Observation = ObservationBase.superRefine((o, ctx) => {
  if (o.seeded && o.confidence !== 0) {
    ctx.addIssue({ code: 'custom', message: 'a seeded observation has confidence 0', path: ['confidence'] });
  }
});
export type Observation = z.infer<typeof Observation>;

/** The public view drops the nullifier — never a nullifier-keyed movement history. */
export const PublicObservation = ObservationBase.omit({ worker_nullifier: true });
export type PublicObservation = z.infer<typeof PublicObservation>;
