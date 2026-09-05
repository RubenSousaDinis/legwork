import type { NextConfig } from 'next';

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
