import { HEADERS, type TaskView } from '@legwork/shared';
import { resolveUrl, subgraphClient } from './live';

/**
 * The receipt an external builder's agent is handed through `dashboard_url`. One
 * public read of `GET /tasks/:id`, plus the subgraph's `seeded` flag for the honesty
 * chip — never inferred, and rendered as `seeded status unavailable` when the index
 * cannot answer rather than silently reading as "not seeded".
 */

/** `TaskView` under the name §6 gives it. The shape is frozen in `api-contract.ts`. */
export type TaskResponse = TaskView;

export interface TaskReceipt {
  task: TaskResponse;
  seeded: boolean | null;
}

export interface GetTaskReceiptOptions {
  /**
   * The `?t=` buyer token. Forwarded server-side as a header exactly once, so the
   * route can reveal `proof.url`. It is never rendered, never logged and never put in
   * a link.
   */
  buyerToken?: string;
}

export const TASK_SEEDED_QUERY = `
query TaskSeeded($id: ID!) {
  task(id: $id) {
    id
    seeded
  }
}
`;

export async function getTaskReceipt(
  id: string,
  opts: GetTaskReceiptOptions = {},
): Promise<TaskReceipt | null> {
  const headers: Record<string, string> = {};
  if (opts.buyerToken) headers[HEADERS.buyerToken] = opts.buyerToken;

  let task: TaskResponse;
  try {
    const response = await fetch(resolveUrl(`/tasks/${encodeURIComponent(id)}`), {
      cache: 'no-store',
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    });
    // A 404 is a receipt that does not exist, which is `notFound()` and not an error.
    if (!response.ok) return null;
    task = (await response.json()) as TaskResponse;
  } catch {
    return null;
  }

  const client = subgraphClient();
  let seeded: boolean | null = null;
  if (client) {
    const data = await client
      .query<{ task: { seeded: boolean } | null }>(TASK_SEEDED_QUERY, { id })
      .catch(() => null);
    seeded = data?.task?.seeded ?? null;
  }

  return { task, seeded };
}
