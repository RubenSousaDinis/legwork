import {
  Envelope,
  NEED_BY_MIN_LEAD_S,
  SPEC_MAX_CHARS,
  canonicalJson,
  type AbuseClass,
} from '@legwork/shared';
import type { PlaceIndex } from './place-index.js';
import { normalizePhone } from './place-index.js';
import { REASONS } from './reasons.js';

/** Step 2's outcomes. Everything is `invalid_request` except the one residential refusal. */
export type SchemaCheckResult =
  | { ok: true }
  | { ok: false; kind: 'invalid_request'; field: string; reason: string }
  | { ok: false; kind: 'refusal'; class: AbuseClass; rule_id: string; reason: string };

const TRANSCRIPTION_RE = /transcri|read (?:out|the) (?:digits|numbers|text|code)|type (?:out|up) the/iu;
const SAFETY_CRITERION_RE = /nsfw|explicit|safe for work|adult content|hate speech|obscen/iu;

const invalid = (field: string, reason: string): SchemaCheckResult => ({
  ok: false,
  kind: 'invalid_request',
  field,
  reason,
});

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Step 2 of the pipeline, in order, stopping at the first failure. Every outcome is a plain
 * 4xx with the offending field named and **no mark** — an evangelist's first malformed call
 * must not brand their agent — except `place.residential`, which is a refusal because asking
 * a stranger to photograph a home is reconnaissance whatever the schema says.
 */
export function runSchemaChecks(
  envelope: Record<string, unknown>,
  taskType: string,
  deps: { places: PlaceIndex; now: () => Date },
): SchemaCheckResult {
  const rawSpec = envelope['spec'];

  // 1. The 300-char cap, measured on the spec as received — before zod strips an unknown key.
  if (canonicalJson(rawSpec ?? null).length > SPEC_MAX_CHARS) {
    return invalid('spec', REASONS.specTooLong);
  }

  // 2. compare-two content that is forbidden however well-formed it is.
  if (taskType === 'compare-two') {
    const spec = asRecord(rawSpec);
    for (const key of ['a', 'b', 'reference'] as const) {
      const text = str(asRecord(spec[key])['text']);
      if (text && TRANSCRIPTION_RE.test(text)) {
        return invalid(`spec.${key}.text`, REASONS.transcriptionForbidden);
      }
    }
    if (SAFETY_CRITERION_RE.test(str(spec['criterion_id']))) {
      return invalid('spec.criterion_id', REASONS.safetyJudgementForbidden);
    }
  }

  // 3. The envelope schema itself.
  const parsed = Envelope.safeParse(envelope);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue) return invalid(issue.path.join('.'), issue.message);
    return invalid('spec', REASONS.specTooLong);
  }

  // 4. `need_by` against the caller's clock rather than the schema's.
  const needBy = parsed.data.need_by;
  if (needBy && Date.parse(needBy) < deps.now().getTime() + NEED_BY_MIN_LEAD_S * 1000) {
    return invalid('need_by', REASONS.needByTooSoon);
  }

  // 5. The place, against the cached extract. No live geocoder on any path.
  const spec = parsed.data.spec as { place?: { place_id: string; name: string; street_address: string } };
  const place = spec.place;
  if (place) {
    const poi = deps.places.resolve(place.place_id);
    if (!poi) return invalid('spec.place.place_id', REASONS.regionNotCovered);
    if (deps.places.isResidential(place.place_id)) {
      return {
        ok: false,
        kind: 'refusal',
        class: 'automated reconnaissance',
        rule_id: 'place.residential',
        reason: REASONS.placeIsResidential,
      };
    }
    if (!deps.places.isBusiness(place.place_id)) {
      return invalid('spec.place.place_id', REASONS.placeNotBusiness);
    }
    const match = deps.places.fuzzyMatch(place.place_id, place.name, place.street_address);
    if (!match.ok) {
      return invalid(
        match.streetOk ? 'spec.place.name' : 'spec.place.street_address',
        REASONS.placeDoesNotMatch,
      );
    }
  }

  // 6. The number the worker will dial belongs to the place, not to the buyer.
  if (parsed.data.task_type === 'call-confirm') {
    const listed = deps.places.phoneOf(parsed.data.spec.place.place_id);
    if (!listed) return invalid('spec.phone', REASONS.phoneMissing);
    if (normalizePhone(parsed.data.spec.phone) !== listed) {
      return invalid('spec.phone', REASONS.phoneMismatch);
    }
  }

  return { ok: true };
}
