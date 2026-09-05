import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * The workspace packages ship TypeScript sources, so the bundler compiles them here rather
   * than expecting a build step that does not exist.
   */
  transpilePackages: ['@legwork/chain', '@legwork/shared'],
};

export default nextConfig;
