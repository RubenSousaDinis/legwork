/** Public origins the dashboard may print. Fallbacks are the registered hosts, not placeholders. */

export function miniappUrl(): string {
  return process.env.NEXT_PUBLIC_MINIAPP_URL ?? 'https://legwork-miniapp.vercel.app';
}

export function apiUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
}

/** This dashboard's own origin — the same rule `layout.tsx` uses for metadataBase. */
export function dashboardUrl(): string {
  return process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
}

export const GITHUB_REPO = 'https://github.com/RubenSousaDinis/legwork';
