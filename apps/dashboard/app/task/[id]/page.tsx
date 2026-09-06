import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDemoTaskReceipt, getTaskReceipt, resolveDataMode } from '../../../lib/data';
import { LiveReceipt } from './LiveReceipt';
import { Receipt } from './Receipt';

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * `/task/<id>` — the receipt `dashboard_url` points an external builder's agent at.
 *
 * Thin on purpose. The one thing it owns is the buyer token: `?t=` is read here, on the
 * server, forwarded once as a header so the API can reveal the signed thumbnail URL,
 * and then dropped. It is never rendered, never logged and never put in a link.
 */

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function load(id: string, searchParams: SearchParams) {
  if (resolveDataMode(process.env.DATA_MODE) === 'demo') return getDemoTaskReceipt(id);
  const buyerToken = firstParam(searchParams.t);
  return getTaskReceipt(id, buyerToken ? { buyerToken } : {});
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const receipt = await load(id, {});
  const state = (receipt?.task.status ?? 'unknown').toUpperCase();
  const title = `Legwork · task #${id} · ${state}`;
  const description = 'Bounded, attributable work on Base Sepolia — escrow, proof and the tx behind it.';
  const image = `/task/${id}/opengraph-image`;
  return {
    title,
    description,
    openGraph: { title, description, siteName: 'Legwork', type: 'article', images: [{ url: image, width: 1200, height: 630, alt: title }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export default async function TaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const receipt = await load(id, sp);
  if (!receipt) notFound();

  const mode = resolveDataMode(process.env.DATA_MODE);
  if (mode === 'live') return <LiveReceipt initial={receipt} />;
  return <Receipt task={receipt.task} seeded={receipt.seeded} dataMode="demo" />;
}
