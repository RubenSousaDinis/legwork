import { Chip } from './Chip';
import { demoPoolHeadline, poolHeadline } from '../lib/data/pool';

/**
 * The pool chip on the static pages, and the same headline inline in a sentence.
 *
 * In demo mode the answer is synchronous, so the page tests render it like any other chip.
 * In live mode it is an async server component: one subgraph read per revalidation, and
 * nothing at all when the index cannot answer. A live page never prints a demo count.
 */
export function PoolChip() {
  if (process.env.DATA_MODE !== 'live') return <Chip tone="seeded">{demoPoolHeadline()}</Chip>;
  return <LivePoolChip />;
}

async function LivePoolChip() {
  const text = await poolHeadline('live');
  return text === null ? null : <Chip tone="seeded">{text}</Chip>;
}

/** `The pool reads {…}.` — the headline as text, for a sentence that quotes it. */
export function PoolHeadline() {
  if (process.env.DATA_MODE !== 'live') return <>{demoPoolHeadline()}</>;
  return <LivePoolHeadline />;
}

async function LivePoolHeadline() {
  const text = await poolHeadline('live');
  return <>{text ?? 'what the subgraph counts'}</>;
}
