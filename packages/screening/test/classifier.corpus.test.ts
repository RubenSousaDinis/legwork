import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import {
  CLASSIFIER_TIMEOUT_LABEL,
  SPEC_MAX_CHARS,
  type AbuseClass,
  type TaskType,
} from '@legwork/shared';
import { AnthropicClassifier, DEFAULT_CLASSIFIER_MODEL } from '../src/classifier/anthropic.js';
import { JsonPlaceIndex } from '../src/gate/place-index.js';
import { screen } from '../src/pipeline.js';

/**
 * T-06's `corpus.test.ts` runs the same rows against `FakeClassifier`. This file runs the
 * free-text rows against the real class over a mocked transport — the only behavioural
 * difference — so the model step is exercised through `screen()` and not in isolation.
 */
type CorpusRow = {
  id: number;
  class: AbuseClass | null;
  envelope: unknown;
  classifier?: { result?: { class: AbuseClass | null; confidence: number } };
};

const corpus: { now: string; rows: CorpusRow[] } = JSON.parse(
  readFileSync(new URL('../fixtures/corpus.json', import.meta.url), 'utf8'),
);
const places = JsonPlaceIndex.fromFile('fixtures/osm/leiria-min.json');
const now = () => new Date(corpus.now);

const rowOf = (id: number) => {
  const row = corpus.rows.find((r) => r.id === id);
  if (!row) throw new Error(`row ${id} missing from the corpus`);
  return row;
};

const messageBody = (content: unknown[]) => ({
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  model: DEFAULT_CLASSIFIER_MODEL,
  content,
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 12, output_tokens: 8 },
});

/** Answers every request with one structured-output body. No socket is ever opened. */
const answeringFetch = (answer: { class: AbuseClass | null; confidence: number }) =>
  vi.fn(
    async () =>
      new Response(JSON.stringify(messageBody([{ type: 'text', text: JSON.stringify(answer) }])), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );

/** Never resolves; rejects on abort, so the fallback is reached for the right reason. */
const hangingFetch = () =>
  vi.fn(
    (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const abort = () => reject(new DOMException('aborted', 'AbortError'));
        if (!signal) return;
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort);
      }),
  );

const classifierOver = (fetch: ReturnType<typeof answeringFetch> | ReturnType<typeof hangingFetch>) =>
  new AnthropicClassifier({
    client: new Anthropic({ apiKey: 'test-not-a-key', fetch }),
    timeoutMs: 20,
  });

const run = (
  envelope: unknown,
  fetch: ReturnType<typeof answeringFetch> | ReturnType<typeof hangingFetch>,
) => screen(envelope, { places, classifier: classifierOver(fetch), now, timeoutMs: 20 });

describe('classifier corpus', () => {
  it('classifierNeverOverturnsGate', async () => {
    // "Our classifier can only be talked into refusing, never into accepting."
    const enumerated = answeringFetch({ class: null, confidence: 0.99 });
    const onPath = await run(rowOf(22).envelope, enumerated);
    expect(onPath.ok).toBe(false);
    if (onPath.ok || onPath.kind !== 'refusal') throw new Error('row 22 was not refused');
    expect(onPath.payload.class).toBe('authentication circumvention');
    expect(enumerated.mock.calls).toHaveLength(0);

    const freeText = answeringFetch({ class: null, confidence: 0.99 });
    const offPath = await run(rowOf(44).envelope, freeText);
    expect(offPath.ok).toBe(false);
    if (offPath.ok || offPath.kind !== 'refusal') throw new Error('row 44 was not refused');
    expect(offPath.payload.class).toBe('authentication circumvention');
    expect(offPath.payload.rule_id.startsWith('kw.authentication-circumvention.')).toBe(true);
  });

  it('specCapEnforcedBeforeCall', async () => {
    // Row 47 is a 2,000-character prompt injection. It never reaches the model.
    const mockFetch = answeringFetch({ class: null, confidence: 0.99 });
    const capped = await run(rowOf(47).envelope, mockFetch);
    expect(capped.ok).toBe(false);
    if (capped.ok || capped.kind !== 'invalid_request') throw new Error('row 47 was not a 4xx');
    expect(capped.field).toBe('spec');
    expect(mockFetch.mock.calls).toHaveLength(0);

    // And the cap holds when the classifier is called directly, above the client, not below it.
    const direct = answeringFetch({ class: null, confidence: 0.99 });
    const alone = await new AnthropicClassifier({
      client: new Anthropic({ apiKey: 'test-not-a-key', fetch: direct }),
    }).classify('x'.repeat(SPEC_MAX_CHARS + 1));
    expect(alone.source).toBe('keyword');
    expect('label' in alone).toBe(false);
    expect(direct.mock.calls).toHaveLength(0);
  });

  describe('rows 40–48', () => {
    for (const id of [40, 41, 42, 43, 44, 45]) {
      const row = rowOf(id);
      it(`row ${id} refuses with ${row.class}`, async () => {
        const answer = row.classifier?.result;
        if (!answer) throw new Error(`row ${id} carries no classifier fixture`);
        expect(answer.confidence).toBe(0.9);

        const mockFetch = answeringFetch({ class: answer.class, confidence: answer.confidence });
        const result = await run(row.envelope, mockFetch);
        expect(result.ok).toBe(false);
        if (result.ok || result.kind !== 'refusal') throw new Error(`row ${id} was not refused`);
        expect(result.payload.class).toBe(row.class);
      });
    }

    it('row 46 is a 4xx on task_type that suggests verify-open', async () => {
      const mockFetch = answeringFetch({ class: null, confidence: 0.1 });
      const result = await run(rowOf(46).envelope, mockFetch);
      expect(result.ok).toBe(false);
      if (result.ok || result.kind !== 'invalid_request') throw new Error('row 46 was not a 4xx');
      expect(result.field).toBe('task_type');
      expect(result.suggested_task_type).toBe('verify-open' satisfies TaskType);
    });

    it('row 47 never reaches the model', async () => {
      const mockFetch = answeringFetch({ class: null, confidence: 0.9 });
      await run(rowOf(47).envelope, mockFetch);
      expect(mockFetch.mock.calls).toHaveLength(0);
    });

    it('row 48 refuses with the keyword class when the model never answers', async () => {
      const mockFetch = hangingFetch();
      const result = await run(rowOf(48).envelope, mockFetch);
      expect(result.ok).toBe(false);
      if (result.ok || result.kind !== 'refusal') throw new Error('row 48 was not refused');
      expect(result.payload.class).toBe('authentication circumvention');
      expect(result.payload.reason).toBe(CLASSIFIER_TIMEOUT_LABEL);
    });
  });
});
