/**
 * Every reason string the gate can emit. They are constants because a reason is rendered on
 * the dashboard next to the class and the spec hash: it may never interpolate spec text,
 * a place name or a buyer identity.
 */
export const REASONS = {
  specTooLong: 'spec exceeds 300 characters',
  transcriptionForbidden: 'transcription is not a compare-two criterion',
  safetyJudgementForbidden: 'safety judgement is not a compare-two criterion',
  needByTooSoon: 'need_by must be at least 20 minutes in the future',
  regionNotCovered: 'region not covered',
  placeIsResidential: 'a task may only be about a business, never a home',
  placeNotBusiness: 'place is not a business',
  placeDoesNotMatch: 'place name/street does not match the OSM object',
  phoneMissing: 'place has no verified phone',
  phoneMismatch: 'phone does not match the place',
  typeGate: 'task_type must be one of verify-open, photo-of, call-confirm, compare-two',
  classifier: 'classifier',
} as const;

export type Reason = (typeof REASONS)[keyof typeof REASONS];
