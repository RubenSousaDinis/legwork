import { PresentCanvas } from './(present)/PresentCanvas';
import { Landing } from './Landing';
import { loadDashboardData, parseFeaturedState } from '../lib/data';

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * `/` is the front door. `?present=1` swaps the landing for the sparse present
 * layout; `?state=` previews a meter beat; `?task=<id>` pins the filmed task as the
 * featured row. The present branch is the filmed canvas and the CI gate; it does
 * not move. The landing is static and does not wait on the API or the subgraph.
 */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;

  if (sp.present === '1') {
    const state = parseFeaturedState(sp.state);
    const taskId = firstParam(sp.task);
    const data = await loadDashboardData(process.env.DATA_MODE, {
      ...(state ? { state } : {}),
      ...(taskId ? { taskId } : {}),
    });
    return <PresentCanvas data={data} />;
  }

  return <Landing />;
}
