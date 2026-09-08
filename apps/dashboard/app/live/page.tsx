import type { Metadata } from 'next';
import { LiveMissionControl } from '../LiveMissionControl';
import { SiteHeader } from '../../components/SiteHeader';
import { loadDashboardData, parseFeaturedState } from '../../lib/data';

export const metadata: Metadata = {
  title: 'Legwork · live',
};

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Mission control, moved from `/`. `?state=` previews a meter beat; `?task=<id>`
 * pins the filmed task as the featured row. The board's markup is unchanged.
 */
export default async function LivePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const state = parseFeaturedState(sp.state);
  const taskId = firstParam(sp.task);
  const data = await loadDashboardData(process.env.DATA_MODE, {
    ...(state ? { state } : {}),
    ...(taskId ? { taskId } : {}),
  });

  return (
    <>
      <SiteHeader current="live" />
      <LiveMissionControl initial={data} {...(taskId ? { taskId } : {})} />
    </>
  );
}
