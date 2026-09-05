import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AbuseClass } from '@legwork/shared';
import { createLiveClassifier } from '../src/classifier/live.js';

/**
 * The one real call in the package, off by default. The operator runs it once — the product
 * key carries a $40 spend cap — and records p50 and cost in `docs/spikes/RESULTS.md#Classifier`.
 * CI never runs it: the `ts` job clears the flag and every other test uses a mocked transport.
 */
type CorpusRow = { id: number; class: AbuseClass | null; envelope: { spec: string } };

const corpus: { rows: CorpusRow[] } = JSON.parse(
  readFileSync(new URL('../fixtures/corpus.json', import.meta.url), 'utf8'),
);

const rowOf = (id: number) => {
  const row = corpus.rows.find((r) => r.id === id);
  if (!row) throw new Error(`row ${id} missing from the corpus`);
  return row;
};

/** Five of the six free-text abuse rows; row 42 is left out because it carries a person's name. */
const ROW_IDS = [40, 41, 43, 44, 45];

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

describe.skipIf(process.env.LIVE_LLM !== '1')('classifier live', () => {
  const realFetch = globalThis.fetch;
  let inputTokens = 0;
  let outputTokens = 0;

  // The result type carries no usage, so the tokens are counted off the wire.
  beforeAll(() => {
    globalThis.fetch = (async (input: Parameters<typeof realFetch>[0], init?: RequestInit) => {
      const response = await realFetch(input, init);
      try {
        const body = (await response.clone().json()) as {
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        inputTokens += body.usage?.input_tokens ?? 0;
        outputTokens += body.usage?.output_tokens ?? 0;
      } catch {
        // Not a JSON body — there is nothing to count.
      }
      return response;
    }) as typeof globalThis.fetch;
  });

  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  it('classifies the five free-text abuse rows against the real model', async () => {
    const latencies: number[] = [];

    for (const id of ROW_IDS) {
      const row = rowOf(id);
      const started = Date.now();
      const result = await createLiveClassifier().classify(row.envelope.spec);
      latencies.push(Date.now() - started);

      expect(result.source).toBe('model');
      expect(result.class).toBe(row.class);
    }

    console.log(
      `classifier live: p50 ${median(latencies)} ms over ${latencies.length} calls · ` +
        `${inputTokens} input tokens · ${outputTokens} output tokens`,
    );
  });
});
