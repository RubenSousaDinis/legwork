import { PresentCanvas } from './(present)/PresentCanvas';
import { MissionControl } from './MissionControl';
import { getDashboardData, parseFeaturedState } from '../lib/data';

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * `/` is the video canvas. `?present=1` swaps mission control for the sparse present
 * layout; `?state=` previews a meter beat. `DATA_MODE` is read here, on the server —
 * it is never exposed to the client bundle.
 */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const state = parseFeaturedState(sp.state);
  const data = getDashboardData(process.env.DATA_MODE, { ...(state ? { state } : {}) });

  if (sp.present === '1') return <PresentCanvas data={data} />;
  return <MissionControl data={data} />;
}
