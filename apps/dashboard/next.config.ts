import type { NextConfig } from 'next';

/**
 * T-26 calls the API through the same-origin `/api` prefix rather than the API's
 * own origin, so the browser never needs a CORS pre-flight and no origin is baked
 * into the client bundle.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [{ source: '/api/:path*', destination: `${API_BASE_URL}/:path*` }],
      fallback: [],
    };
  },
};

export default nextConfig;
