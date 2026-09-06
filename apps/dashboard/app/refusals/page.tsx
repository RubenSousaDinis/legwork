import type { Metadata } from 'next';
import { getDemoRefusals, getLiveRefusals, resolveDataMode } from '../../lib/data';
import { Refusals } from './Refusals';

export const metadata: Metadata = {
  title: 'Legwork · refusals',
  description: 'The six abuse classes, their counts, and what a refused agent is told.',
};

/**
 * `/refusals` — class counts plus hand-picked examples, never a raw live feed.
 *
 * In live mode the counts come from `/public/refusals` and the examples stay demo data,
 * labelled `counts live · examples demo data`. There is no live-example path: an
 * example is a hand-picked thing, and picking one automatically is how a spec text ends
 * up on a public page.
 */
export default async function RefusalsPage() {
  const mode = resolveDataMode(process.env.DATA_MODE);
  const demo = getDemoRefusals();
  if (mode === 'demo') {
    return (
      <Refusals
        counts={demo.counts}
        total={demo.total}
        examples={demo.examples}
        dataMode="demo"
      />
    );
  }

  const live = await getLiveRefusals();
  return (
    <Refusals
      counts={live.counts}
      total={live.total}
      examples={demo.examples}
      dataMode="live"
      {...(live.note ? { note: live.note } : {})}
    />
  );
}
