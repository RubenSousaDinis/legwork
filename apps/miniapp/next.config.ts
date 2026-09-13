import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * `pnpm --filter @legwork/miniapp dev` runs with cwd `apps/miniapp`. Next only loads
 * `.env` from that directory, and this package has none — the World app id lives in the
 * repo-root `.env`. Without it IDKit throws `app_id is required`, which the widget shows
 * as "Something went wrong". Public keys only: nothing secret is inlined.
 */
function applyRootPublicEnv(): void {
  const root = process.cwd().endsWith(`${path.sep}miniapp`)
    ? path.resolve(process.cwd(), '../..')
    : process.cwd();
  let text: string;
  try {
    text = readFileSync(path.join(root, '.env'), 'utf8');
  } catch {
    return;
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key.startsWith('NEXT_PUBLIC_')) continue;
    if (process.env[key]) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

applyRootPublicEnv();

/**
 * `/api/*` is proxied to the API so the mini-app is a single origin inside the World App
 * webview. `afterFiles` means a route handler in `app/api/**` wins over the rewrite — that
 * is what keeps T-05's temporary `/api/idkit/*` handlers reachable.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@legwork/shared'],
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [{ source: '/api/:path*', destination: `${API_BASE_URL}/:path*` }],
      fallback: [],
    };
  },
};

export default nextConfig;
