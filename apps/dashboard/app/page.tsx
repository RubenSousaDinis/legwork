import { PresentCanvas } from './(present)/PresentCanvas';
import { LiveMissionControl } from './LiveMissionControl';
import { loadDashboardData, parseFeaturedState } from '../lib/data';

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * `/` is the video canvas. `?present=1` swaps mission control for the sparse present
 * layout; `?state=` previews a meter beat; `?task=<id>` pins the filmed task as the
 * featured row. `DATA_MODE` is read here, on the server — it is never exposed to the
 * client bundle. In live mode the data is the deployment's (`loadDashboardData`), rendered
 * once on the server and then re-read every 3 s by `LiveMissionControl`.
 */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const state = parseFeaturedState(sp.state);
  const taskId = firstParam(sp.task);
  const data = await loadDashboardData(process.env.DATA_MODE, {
    ...(state ? { state } : {}),
    ...(taskId ? { taskId } : {}),
  });

  if (sp.present === '1') return <PresentCanvas data={data} />;
  return <LiveMissionControl initial={data} {...(taskId ? { taskId } : {})} />;
}
