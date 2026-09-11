import type { Metadata } from 'next';
import { Overview } from './Overview';

/**
 * Unlisted briefing: product, flows, architecture. Reachable by URL, kept out of
 * the site header, and marked `noindex` so it does not join the public IA.
 */
export const metadata: Metadata = {
  title: 'Legwork · overview',
  description:
    'Product overview, worker and agent flows, and technical architecture. Unlisted.',
  robots: { index: false },
};

export default function OverviewPage() {
  return <Overview />;
}
