import { PresentCanvas } from '../PresentCanvas';
import { loadDashboardData, parseFeaturedState } from '../../../lib/data';

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * `/present` is the same canvas as `/?present=1`, with no query to remember on set.
 * `?task=<id>` pins the filmed task; live data comes from `loadDashboardData` and T-43
 * mounts the 3-s poll inside the canvas.
 */
export default async function PresentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const state = parseFeaturedState(sp.state);
  const taskId = firstParam(sp.task);
  const data = await loadDashboardData(process.env.DATA_MODE, {
    ...(state ? { state } : {}),
    ...(taskId ? { taskId } : {}),
  });
  return <PresentCanvas data={data} />;
}
