import { z } from 'zod';
import { Place } from './place.js';

export const SOURCES = ['google', 'osm', 'own-list', 'website', 'other', 'none'] as const;
export const Source = z.enum(SOURCES);

// ---------------------------------------------------------------- verify-open
export const VerifyOpenSpec = z.object({
  place: Place,
  question: z.literal('open_now'),
  claimed_open: z.boolean().nullable(),
  claimed_hours: z.string().max(60).nullable(),
  source: Source,
});
export type VerifyOpenSpec = z.infer<typeof VerifyOpenSpec>;

// ------------------------------------------------------------------- photo-of
export const PHOTO_SUBJECTS = [
  'storefront', 'door', 'hours_sign', 'signage', 'notice',
  'menu_board', 'shelf_price', 'queue_length', 'construction_notice',
] as const;
export const PhotoOfSpec = z.object({
  place: Place,
  subject: z.enum(PHOTO_SUBJECTS),
  subject_detail: z.string().max(80).optional(),
  claimed_state: z.string().max(60).optional(),
  source: Source,
});
export type PhotoOfSpec = z.infer<typeof PhotoOfSpec>;

// --------------------------------------------------------------- call-confirm
export const CALL_TEMPLATE_IDS = [
  'open_now', 'have_item', 'price_of', 'accepts_payment', 'closes_at_today', 'takes_reservation',
] as const;
export type CallTemplateId = (typeof CALL_TEMPLATE_IDS)[number];

export const PAYMENT_METHODS = ['cash', 'card', 'mbway', 'multibanco'] as const;

/**
 * The closed template list. The worker's question is rendered from `template_id` and never
 * from buyer text, so "ask them to read you the six-digit code" cannot be expressed.
 * Transcribed from 10-schemas §5.
 */
export const CALL_CONFIRM_TEMPLATES = {
  open_now:          { question: 'Are you open right now?',                answers: ['yes', 'no', 'no_answer'] },
  have_item:         { question: 'Do you have <item> in stock?',           answers: ['yes', 'no', 'unknown', 'no_answer'] },
  price_of:          { question: 'What is the price of <item>?',           answers: ['price', 'unknown', 'no_answer'] },
  accepts_payment:   { question: 'Do you take <payment_method>?',          answers: ['yes', 'no', 'no_answer'] },
  closes_at_today:   { question: 'Until what time are you open today?',    answers: ['time', 'closed_today', 'no_answer'] },
  takes_reservation: { question: 'Do you take reservations?',              answers: ['yes', 'no', 'no_answer'] },
} as const satisfies Record<CallTemplateId, { question: string; answers: readonly string[] }>;

/**
 * Denylist over the whole serialized spec, case-insensitive, PT + EN. Data, not code: the
 * gate (T-06) applies it and tags each hit with an abuse class. Two rules that are not
 * words live alongside: any run of 4+ digits inside `slots`, and any URL.
 * Transcribed from 10-schemas §5.
 */
export const CALL_CONFIRM_DENYLIST = [
  'code', 'código', 'PIN', 'OTP', '2FA', 'verification', 'verificação', 'password', 'palavra-passe',
  'read back', 'read me', 'diga-me o', 'confirm my identity', 'confirmar a minha identidade',
  'say you are', 'diga que é', 'on my behalf', 'em meu nome', 'account', 'conta', 'sign up',
  'register', 'referral', 'link',
] as const;
export const CALL_CONFIRM_DENY_PATTERNS = {
  digitsInSlots: /\d{4,}/,
  url: /https?:\/\/|www\./i,
} as const;

export const E164 = /^\+[1-9]\d{6,14}$/;

export const CallConfirmSpec = z.object({
  place: Place,
  phone: z.string().regex(E164, 'E.164, e.g. +351244000000'),
  template_id: z.enum(CALL_TEMPLATE_IDS),
  slots: z.object({
    item: z.string().max(40).optional(),
    payment_method: z.enum(PAYMENT_METHODS).optional(),
  }),
});
export type CallConfirmSpec = z.infer<typeof CallConfirmSpec>;

// ---------------------------------------------------------------- compare-two
export const COMPARE_CRITERIA = [
  'more_legible', 'matches_reference', 'better_lit', 'same_place', 'which_is_newer', 'which_is_open',
] as const;

export const CompareItem = z.object({
  kind: z.enum(['image', 'text']),
  url: z.url().max(2048).optional(),
  text: z.string().max(500).optional(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, 'lowercase hex sha256'),
}).refine((i) => (i.kind === 'image' ? !!i.url : !!i.text), {
  message: 'an image item needs url; a text item needs text',
});

export const CompareTwoSpec = z.object({
  a: CompareItem,
  b: CompareItem,
  criterion_id: z.enum(COMPARE_CRITERIA),
  reference: CompareItem.optional(),
});
export type CompareTwoSpec = z.infer<typeof CompareTwoSpec>;

export const SPEC_BY_TYPE = {
  'verify-open': VerifyOpenSpec,
  'photo-of': PhotoOfSpec,
  'call-confirm': CallConfirmSpec,
  'compare-two': CompareTwoSpec,
} as const;
