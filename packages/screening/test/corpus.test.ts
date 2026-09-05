import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CLASSIFIER_TIMEOUT_LABEL,
  NO_RETRY_SENTENCE,
  TASK_TYPES,
  specHash,
  type AbuseClass,
  type TaskType,
} from '@legwork/shared';
import { FakeClassifier, type ClassifierResult } from '../src/classifier/types.js';
import { JsonPlaceIndex } from '../src/gate/place-index.js';
import { screen, type ScreenLogEntry } from '../src/pipeline.js';

type CorpusRow = {
  id: number;
  task_type: string;
  summary: string;
  expected: 'ACCEPT' | 'REFUSE';
  class: AbuseClass | null;
  gate: string | null;
  marks: boolean;
  envelope: unknown;
  classifier?: { result?: ClassifierResult; delay_ms?: number };
};

const read = (name: string) => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const corpus: { now: string; rows: CorpusRow[] } = read('../fixtures/corpus.json');
const places = JsonPlaceIndex.fromJson(read('../fixtures/osm/leiria-min.json'));

const now = () => new Date(corpus.now);

function fakeFor(row: CorpusRow): FakeClassifier {
  return new FakeClassifier({
    ...(row.classifier?.result ? { fallback: row.classifier.result } : {}),
    ...(row.classifier?.delay_ms ? { delayMs: row.classifier.delay_ms } : {}),
  });
}

/** Rows whose verdict must be reached without the classifier ever being consulted. */
const NO_CLASSIFIER = (id: number) => (id >= 1 && id <= 39) || (id >= 49 && id <= 55);

describe('corpus', () => {
  it('corpusAllRowsPass', async () => {
    expect(corpus.rows).toHaveLength(56);
    let checked = 0;

    for (const row of corpus.rows) {
      const classifier = fakeFor(row);
      const result = await screen(row.envelope, { places, classifier, now, timeoutMs: 20 });
      const where = `row ${row.id} (${row.summary})`;

      if (row.expected === 'ACCEPT' || row.gate === 'cap') {
        // The open-task cap is the API's business (T-16); screening still says yes.
        expect(result, where).toMatchObject({ ok: true });
      } else if (row.class !== null) {
        expect(result.ok, where).toBe(false);
        if (result.ok) throw new Error(where);
        expect(result.kind, where).toBe('refusal');
        if (result.kind !== 'refusal') throw new Error(where);
        expect(result.payload.class, where).toBe(row.class);
        expect(result.payload.retryable, where).toBe(false);
        expect(result.payload.message, where).toBe(NO_RETRY_SENTENCE);
        expect(result.payload.rule_id.length, where).toBeGreaterThan(0);
      } else {
        expect(result.ok, where).toBe(false);
        if (result.ok) throw new Error(where);
        expect(result.kind, where).toBe('invalid_request');
        if (result.kind !== 'invalid_request') throw new Error(where);
        expect(result.field.length, where).toBeGreaterThan(0);
      }

      if (row.id === 46 || row.id === 56) {
        if (result.ok || result.kind !== 'invalid_request') throw new Error(where);
        expect(result.suggested_task_type, where).toBe(row.id === 46 ? 'verify-open' : 'photo-of');
        expect(result.allowed_task_types, where).toEqual([...TASK_TYPES]);
      }
      if (row.id === 47) expect(classifier.calls, where).toHaveLength(0);
      if (NO_CLASSIFIER(row.id)) expect(classifier.calls, where).toHaveLength(0);
      checked++;
    }

    expect(checked).toBe(56);
    console.log(`screening corpus: ${checked}/${corpus.rows.length} rows`);
  });

  it('fixture1ActOneAccepts', async () => {
    // Fixture 1 is the Act-1 demo spec. If it ever refuses, the build is red.
    const row = corpus.rows.find((r) => r.id === 1);
    if (!row) throw new Error('row 1 missing from the corpus');
    const result = await screen(row.envelope, {
      places,
      classifier: new FakeClassifier(),
      now,
      timeoutMs: 20,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('row 1 refused');
    expect(result.spec_hash).toBe(specHash(row.envelope));
    expect(result.spec_hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('row48TimeoutLabel', async () => {
    const row = corpus.rows.find((r) => r.id === 48);
    if (!row) throw new Error('row 48 missing from the corpus');
    const entries: ScreenLogEntry[] = [];
    const result = await screen(row.envelope, {
      places,
      classifier: new FakeClassifier({ delayMs: 200 }),
      now,
      timeoutMs: 20,
      logger: { info: (e) => entries.push(e) },
    });
    expect(result.ok).toBe(false);
    if (result.ok || result.kind !== 'refusal') throw new Error('row 48 was not refused');
    expect(result.payload.class).toBe('authentication circumvention');
    expect(result.payload.reason).toBe(CLASSIFIER_TIMEOUT_LABEL);
    expect(result.payload.rule_id.startsWith('kw.authentication-circumvention.')).toBe(true);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.classifier_label).toBe(CLASSIFIER_TIMEOUT_LABEL);
    expect(entries[0]?.classifier_source).toBe('keyword');
  });

  it('noRawSpecInLogs', async () => {
    const allowedKeys = new Set([
      'at', 'task_type', 'verdict', 'class', 'rule_id', 'field',
      'spec_hash', 'classifier_source', 'classifier_label', 'duration_ms',
    ]);

    // Every string a buyer could have written, across the whole corpus.
    const secrets = new Set<string>();
    const harvest = (node: unknown) => {
      if (typeof node === 'string') {
        if (node.length >= 6) secrets.add(node);
        return;
      }
      if (Array.isArray(node)) return node.forEach(harvest);
      if (node && typeof node === 'object') Object.values(node).forEach(harvest);
    };
    for (const row of corpus.rows) {
      const envelope = row.envelope as { spec?: unknown; task_type?: unknown };
      harvest(envelope.spec);
      const type = envelope.task_type;
      if (typeof type === 'string' && !(TASK_TYPES as readonly string[]).includes(type)) harvest(type);
    }

    const entries: ScreenLogEntry[] = [];
    for (const row of corpus.rows) {
      await screen(row.envelope, {
        places,
        classifier: fakeFor(row),
        now,
        timeoutMs: 20,
        logger: { info: (e) => entries.push(e) },
      });
    }

    expect(entries).toHaveLength(56);
    for (const entry of entries) {
      for (const key of Object.keys(entry)) expect(allowedKeys, key).toContain(key);
      const serialized = JSON.stringify(entry);
      for (const secret of secrets) {
        expect(serialized.includes(secret), `log leaked ${JSON.stringify(secret.slice(0, 24))}`).toBe(false);
      }
      expect((entry.task_type as string) === 'unknown' || (TASK_TYPES as readonly TaskType[]).includes(entry.task_type as TaskType)).toBe(true);
    }
  });
});
