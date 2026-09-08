/** Public origins the dashboard may print. Fallbacks are the registered hosts, not placeholders. */

export const DEPLOYED_API = 'https://legwork-api.vercel.app';
export const DEPLOYED_MINIAPP = 'https://legwork-miniapp.vercel.app';
export const DEPLOYED_DASHBOARD = 'https://legwork-dashboard.vercel.app';

function isLoopback(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return true;
  }
}

/** Origin a public page may print. Loopback is a local rewrite target, not an install host. */
function publicOrigin(raw: string | undefined, deployed: string): string {
  if (!raw) return deployed;
  const trimmed = raw.replace(/\/$/, '');
  return isLoopback(trimmed) ? deployed : trimmed;
}

export function miniappUrl(): string {
  return publicOrigin(process.env.NEXT_PUBLIC_MINIAPP_URL, DEPLOYED_MINIAPP);
}

export function apiUrl(): string {
  return publicOrigin(process.env.NEXT_PUBLIC_API_BASE_URL, DEPLOYED_API);
}

/** Printed origin of this dashboard. Loopback or a missing Vercel URL → the hosted app. */
export function dashboardUrl(): string {
  const fromVercel = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;
  return publicOrigin(fromVercel, DEPLOYED_DASHBOARD);
}

export const GITHUB_REPO = 'https://github.com/RubenSousaDinis/legwork';
