/**
 * `hire_human`, hosted — the tool that cannot pay, and says so.
 *
 * An MCP client cannot answer an x402 challenge, so this mode does the two things it honestly
 * can: it screens the spec, then asks `POST /tasks` **without any payment credential** so the
 * API answers 402 with its own requirements. What comes back is a quote and an install line,
 * never a task id and never a claim to have posted anything.
 *
 * The `PAYMENT-SIGNATURE` header this comment names is the one this file must never build:
 * `pnpm` verification greps the whole of `src/` for it and expects to find it nowhere but here.
 * `price_usdc` and `pay_to` are lifted out of the 402 body rather than recomputed, so the
 * figure an agent is quoted is the figure the escrow will lock.
 */
import type { z } from 'zod';
import { INSTALL_LINE, type HireHumanHostedResult, type RefusalPayload } from '@legwork/shared';
import { dashboardUrlFor, type HireHumanInput, type ToolContext } from '../context';
import { postCheck, postTaskUnpaid } from '../http';
import { isRefusal } from './check';
import { toolError, toolResult, type ToolResult } from './result';

export type HostedHireResult =
  | z.infer<typeof HireHumanHostedResult>
  | z.infer<typeof RefusalPayload>;

interface PaymentRequiredBody {
  error?: string;
  price_usdc?: number;
  accepts?: { payTo?: string }[];
}

export async function hostedHireTool(
  ctx: ToolContext,
  input: HireHumanInput,
): Promise<ToolResult<HostedHireResult | { error: string; dashboard_url: string }>> {
  const dashboard_url = dashboardUrlFor(ctx);

  const checked = await postCheck<unknown>(ctx, input);
  if (isRefusal(checked.body)) return toolResult(checked.body);

  const quoted = await postTaskUnpaid<PaymentRequiredBody>(ctx, input);
  if (isRefusal(quoted.body)) return toolResult(quoted.body as unknown as z.infer<typeof RefusalPayload>);

  if (quoted.status !== 402) {
    // Anything else — a cap, an outage — is the API's word, passed on as it stands. Guessing a
    // price here would be inventing the one number the agent is about to act on.
    return toolError(
      `POST /tasks answered ${quoted.status}; no payment requirements to quote`,
      { error: quoted.body?.error ?? `http_${quoted.status}`, dashboard_url },
    );
  }

  const body = quoted.body;
  const payTo = body.accepts?.[0]?.payTo;
  if (typeof body.price_usdc !== 'number' || typeof payTo !== 'string') {
    return toolError('the 402 body carried no price_usdc or payTo to quote', {
      error: 'malformed_payment_required',
      dashboard_url,
    });
  }

  return toolResult({
    payment_required: true as const,
    endpoint: `${ctx.apiBase}/tasks`,
    price_usdc: body.price_usdc,
    network: 'eip155:84532' as const,
    asset: 'USDC' as const,
    pay_to: payTo,
    install_line: INSTALL_LINE,
    dashboard_url,
  });
}
