import { z } from 'zod';
import { NOTE_MAX_CHARS } from '../constants.js';
import { CALL_CONFIRM_TEMPLATES } from './specs.js';

export const Gps = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  accuracy_m: z.number().min(0).max(10_000),
});

const Keccak = z.string().regex(/^0x[0-9a-f]{64}$/, '0x-prefixed lowercase keccak256');
const Note = z.string().max(NOTE_MAX_CHARS).optional();

/**
 * Invariant, from 10-schemas §3: `gps === null ⇔ gps_unavailable === true`, and a downgraded
 * proof must carry the worker's tapped confirmation. Confidence drops to 0.6 (see Observation).
 */
function gpsInvariant(p: { gps: unknown; gps_unavailable: boolean; worker_confirmed_at_place: boolean }, ctx: z.RefinementCtx) {
  if ((p.gps === null) !== p.gps_unavailable) {
    ctx.addIssue({ code: 'custom', message: 'gps must be null exactly when gps_unavailable is true', path: ['gps_unavailable'] });
  }
  if (p.gps_unavailable && !p.worker_confirmed_at_place) {
    ctx.addIssue({ code: 'custom', message: 'a GPS-downgraded proof needs worker_confirmed_at_place', path: ['worker_confirmed_at_place'] });
  }
}

const PhotoProofBase = z.object({
  photo_hash: Keccak,
  gps: Gps.nullable(),
  gps_unavailable: z.boolean(),
  worker_confirmed_at_place: z.boolean(),
  captured_at: z.iso.datetime(),
  note: Note,
});

export const VerifyOpenProof = PhotoProofBase.extend({
  answer: z.enum(['open', 'closed', 'unclear']),
}).superRefine(gpsInvariant);
export type VerifyOpenProof = z.infer<typeof VerifyOpenProof>;

export const PhotoOfProof = PhotoProofBase.extend({
  answer: z.enum(['captured', 'not_found', 'refused_by_staff']),
}).superRefine(gpsInvariant);
export type PhotoOfProof = z.infer<typeof PhotoOfProof>;

/** Labelled everywhere as "self-reported answer + timestamp (unverified)". No webview reads a call log. */
export const CallConfirmProof = z.object({
  template_id: z.enum(Object.keys(CALL_CONFIRM_TEMPLATES) as [keyof typeof CALL_CONFIRM_TEMPLATES, ...(keyof typeof CALL_CONFIRM_TEMPLATES)[]]),
  answer: z.string().max(40),
  price: z.object({ amount: z.number().nonnegative(), currency: z.literal('EUR') }).optional(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  called_at: z.iso.datetime(),
  note: Note,
}).superRefine((p, ctx) => {
  const allowed = CALL_CONFIRM_TEMPLATES[p.template_id].answers as readonly string[];
  if (!allowed.includes(p.answer)) {
    ctx.addIssue({ code: 'custom', message: `answer must be one of ${allowed.join(' | ')} for ${p.template_id}`, path: ['answer'] });
  }
  if (p.answer === 'price' && !p.price) ctx.addIssue({ code: 'custom', message: 'price answer needs price', path: ['price'] });
  if (p.answer === 'time' && !p.time) ctx.addIssue({ code: 'custom', message: 'time answer needs time', path: ['time'] });
});
export type CallConfirmProof = z.infer<typeof CallConfirmProof>;

export const CompareTwoProof = z.object({
  choice: z.enum(['a', 'b', 'neither']),
  reason: z.string().max(NOTE_MAX_CHARS),
});
export type CompareTwoProof = z.infer<typeof CompareTwoProof>;

export const PROOF_BY_TYPE = {
  'verify-open': VerifyOpenProof,
  'photo-of': PhotoOfProof,
  'call-confirm': CallConfirmProof,
  'compare-two': CompareTwoProof,
} as const;
