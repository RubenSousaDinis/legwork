import type { MetadataRoute } from 'next';

/** `/overview` is unlisted; `/admin` is operator-only. Everything else may be indexed. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/overview', '/admin'],
    },
  };
}
