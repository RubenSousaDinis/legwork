import type { NextConfig } from 'next';

/** The slice of webpack's config this file touches; the package itself ships no types here. */
interface WebpackConfig {
  resolve?: { extensionAlias?: Record<string, string[]> };
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * The workspace packages ship TypeScript sources, so the bundler compiles them here rather
   * than expecting a build step that does not exist.
   */
  transpilePackages: ['@legwork/chain', '@legwork/shared'],
  /**
   * `@legwork/chain` imports its own modules as `./env.js` — the extension TypeScript's
   * NodeNext convention writes and the one the file on disk does not have. webpack maps it
   * back with `extensionAlias`; Turbopack has no equivalent, which is why `build` and `dev`
   * pass `--webpack`. Both can go the moment Turbopack grows one.
   */
  webpack: (config: WebpackConfig) => {
    config.resolve ??= {};
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };
    return config;
  },
};

export default nextConfig;
