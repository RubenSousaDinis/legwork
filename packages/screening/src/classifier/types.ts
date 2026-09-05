import type { AbuseClass } from '@legwork/shared';
import { matchKeywordRules } from '../gate/rules.js';

/**
 * What a classifier returns. `source` says where the answer came from, so the dashboard can
 * show "keyword class — classifier timeout" honestly instead of implying a model ran.
 */
export type ClassifierResult = {
  class: AbuseClass | null;
  confidence: number;
  source: 'model' | 'keyword';
  label?: string;
};

/** The whole surface T-21's live classifier implements. Nothing here reaches the network. */
export interface Classifier {
  classify(specText: string): Promise<ClassifierResult>;
}

/**
 * The deterministic fallback: the same six-class keyword rules the gate runs, in the same
 * order, with the same rule ids. It is what the pipeline falls back to when the model times
 * out, and it is the only classifier CI ever runs.
 */
export class KeywordFallbackClassifier implements Classifier {
  classify(specText: string): Promise<ClassifierResult> {
    return Promise.resolve(this.classifyWithRule(specText).result);
  }

  /** The pipeline needs the rule id as well as the class, to put it in the refusal payload. */
  classifyWithRule(specText: string): { result: ClassifierResult; rule_id?: string } {
    const rule = matchKeywordRules(specText);
    if (!rule) return { result: { class: null, confidence: 0, source: 'keyword' } };
    return { result: { class: rule.class, confidence: 1, source: 'keyword' }, rule_id: rule.rule_id };
  }
}

export type FakeClassifierOptions = {
  results?: Record<string, ClassifierResult>;
  fallback?: ClassifierResult;
  delayMs?: number;
  rejectWith?: Error;
};

/** A programmable stand-in for T-21. Tests assert on `calls` that the gate never reached it. */
export class FakeClassifier implements Classifier {
  readonly calls: string[] = [];

  constructor(private readonly options: FakeClassifierOptions = {}) {}

  async classify(specText: string): Promise<ClassifierResult> {
    this.calls.push(specText);
    const { delayMs, rejectWith, results, fallback } = this.options;
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (rejectWith) throw rejectWith;
    return results?.[specText] ?? fallback ?? { class: null, confidence: 0, source: 'model' };
  }
}
