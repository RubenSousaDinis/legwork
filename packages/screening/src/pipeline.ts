import {
  CLASSIFIER_TIMEOUT_LABEL,
  CLASSIFIER_TIMEOUT_MS,
  NO_RETRY_SENTENCE,
  SPEC_MAX_CHARS,
  TASK_TYPES,
  specHash,
  type AbuseClass,
  type RefusalPayload,
  type TaskType,
} from '@legwork/shared';
import { KeywordFallbackClassifier, type Classifier, type ClassifierResult } from './classifier/types';
import { stringLeaves } from './gate/leaves';
import type { PlaceIndex } from './gate/place-index';
import { REASONS } from './gate/reasons';
import { ABUSE_CLASS_SLUG, runDeterministicRules } from './gate/rules';
import { runSchemaChecks } from './gate/schema-checks';

export type ScreenDeps = {
  places: PlaceIndex;
  classifier: Classifier;
  now?: () => Date;
  timeoutMs?: number;
  logger?: { info(entry: ScreenLogEntry): void };
};

export type ScreenResult =
  | { ok: true; spec_hash: `0x${string}` }
  | {
      ok: false;
      kind: 'invalid_request';
      field: string;
      reason: string;
      allowed_task_types?: TaskType[];
      suggested_task_type?: TaskType;
    }
  | { ok: false; kind: 'refusal'; payload: RefusalPayload };

/**
 * One line per screening decision. Keys only: a class, a rule id, a field name and a hash.
 * Never the spec text, never the place, never the buyer — the dashboard renders this entry
 * verbatim and it is the record a refused agent can be shown.
 */
export type ScreenLogEntry = {
  at: string;
  task_type: TaskType | 'unknown';
  verdict: 'ok' | 'invalid_request' | 'refusal';
  class?: AbuseClass | null;
  rule_id?: string;
  field?: string;
  spec_hash: `0x${string}`;
  classifier_source?: ClassifierResult['source'];
  classifier_label?: string;
  duration_ms: number;
};

const ALLOWED: TaskType[] = [...TASK_TYPES];

/** First match wins; the order is the order an agent is most likely to have meant. */
const SUGGESTIONS: readonly [RegExp, TaskType][] = [
  [/open|aberto|fechado|closed|hours|horário/iu, 'verify-open'],
  [/queue|fila|photo|foto|sign|menu|price tag|notice|storefront/iu, 'photo-of'],
  [/call|ligar|phone|telefon|reserv/iu, 'call-confirm'],
  [/compare|which of|qual d/iu, 'compare-two'],
];

const TIMED_OUT = Symbol('classifier-timeout');

async function classifyWithin(
  classifier: Classifier,
  text: string,
  timeoutMs: number,
): Promise<ClassifierResult | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
  });
  try {
    const settled = await Promise.race([
      classifier.classify(text).catch((): typeof TIMED_OUT => TIMED_OUT),
      deadline,
    ]);
    return settled;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function refusal(input: {
  class: AbuseClass;
  reason: string;
  rule_id: string;
}): Extract<ScreenResult, { kind: 'refusal' }> {
  return {
    ok: false,
    kind: 'refusal',
    payload: {
      refused: true,
      class: input.class,
      reason: input.reason,
      rule_id: input.rule_id,
      retryable: false,
      allowed_task_types: ALLOWED,
      message: NO_RETRY_SENTENCE,
    },
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * The screening pipeline of 10-schemas §9. Order is the design:
 *
 * 1. type gate — the four enumerated types, or the free-text path;
 * 2. schema checks, field level, every failure a plain 4xx that never marks;
 * 3. deterministic rules — denylist, named person, the six-class keywords. Authoritative;
 * 4. the classifier, free-text path only, add-only;
 * 5. the refusal payload.
 *
 * Precedence on the enumerated path is refusal > invalid_request > ok, and the classifier is
 * unreachable there: our classifier can only be talked into refusing, never into accepting.
 */
export async function screen(envelope: unknown, deps: ScreenDeps): Promise<ScreenResult> {
  const started = Date.now();
  const now = deps.now ?? (() => new Date());
  const hash = specHash(envelope);
  const log = (entry: Omit<ScreenLogEntry, 'at' | 'spec_hash' | 'duration_ms'>) => {
    deps.logger?.info({
      at: now().toISOString(),
      spec_hash: hash,
      duration_ms: Date.now() - started,
      ...entry,
    });
  };

  const record = isRecord(envelope) ? envelope : {};
  const rawType = record['task_type'];
  const enumerated =
    typeof rawType === 'string' &&
    (TASK_TYPES as readonly string[]).includes(rawType) &&
    isRecord(record['spec']);

  // ---------------------------------------------------------------- enumerated path
  if (enumerated) {
    const taskType = rawType as TaskType;
    const schema = runSchemaChecks(record, taskType, { places: deps.places, now });
    const rule = runDeterministicRules(taskType, record['spec']);

    if (rule) {
      log({ task_type: taskType, verdict: 'refusal', class: rule.class, rule_id: rule.rule_id });
      return refusal(rule);
    }
    if (!schema.ok && schema.kind === 'refusal') {
      log({ task_type: taskType, verdict: 'refusal', class: schema.class, rule_id: schema.rule_id });
      return refusal(schema);
    }
    if (!schema.ok) {
      log({ task_type: taskType, verdict: 'invalid_request', field: schema.field });
      return { ok: false, kind: 'invalid_request', field: schema.field, reason: schema.reason };
    }
    log({ task_type: taskType, verdict: 'ok' });
    return { ok: true, spec_hash: hash };
  }

  // ----------------------------------------------------------------- free-text path
  const text = [typeof rawType === 'string' ? rawType : '', ...stringLeaves(record['spec']).map((l) => l.value)]
    .filter((s) => s.length > 0)
    .join('\n');

  if (text.length > SPEC_MAX_CHARS) {
    log({ task_type: 'unknown', verdict: 'invalid_request', field: 'spec' });
    return { ok: false, kind: 'invalid_request', field: 'spec', reason: REASONS.specTooLong };
  }

  const kw = new KeywordFallbackClassifier().classifyWithRule(text);
  const raced = await classifyWithin(deps.classifier, text, deps.timeoutMs ?? CLASSIFIER_TIMEOUT_MS);
  const model: ClassifierResult =
    raced === TIMED_OUT
      ? { class: kw.result.class, confidence: 0, source: 'keyword', label: CLASSIFIER_TIMEOUT_LABEL }
      : raced.confidence < 0.5
        ? { class: kw.result.class, confidence: 0, source: 'keyword' }
        : raced;

  // The merge rule: the gate's class wins, the model may only add one.
  const cls = kw.result.class ?? model.class;
  if (cls) {
    const rule_id = kw.rule_id ?? `classifier.${ABUSE_CLASS_SLUG[cls]}`;
    const reason = model.label ?? (kw.rule_id ? `keyword rule ${kw.rule_id}` : REASONS.classifier);
    log({
      task_type: 'unknown',
      verdict: 'refusal',
      class: cls,
      rule_id,
      classifier_source: model.source,
      ...(model.label ? { classifier_label: model.label } : {}),
    });
    return refusal({ class: cls, reason, rule_id });
  }

  const suggested = SUGGESTIONS.find(([re]) => re.test(text))?.[1];
  log({
    task_type: 'unknown',
    verdict: 'invalid_request',
    field: 'task_type',
    classifier_source: model.source,
    ...(model.label ? { classifier_label: model.label } : {}),
  });
  return {
    ok: false,
    kind: 'invalid_request',
    field: 'task_type',
    reason: REASONS.typeGate,
    allowed_task_types: ALLOWED,
    ...(suggested ? { suggested_task_type: suggested } : {}),
  };
}
