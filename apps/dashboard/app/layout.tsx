import type { Metadata } from 'next';
import './globals.css';

/**
 * OG and Twitter cards point at the `/opengraph-image` route so every link unfurls
 * with the escrow meter. `metadataBase` is deliberately unset: Next resolves the
 * relative path against the deployment origin, so no origin is hard-coded here.
 */
export const metadata: Metadata = {
  title: 'Legwork — dashboard',
  description:
    'Public, read-only mission control: escrow, screening and the worker pool for bounded, attributable errands on Base Sepolia.',
  openGraph: {
    title: 'Legwork — dashboard',
    description:
      'Public, read-only mission control: escrow, screening and the worker pool for bounded, attributable errands on Base Sepolia.',
    siteName: 'Legwork',
    type: 'website',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Legwork escrow meter' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Legwork — dashboard',
    description: 'Escrow, screening and the worker pool for bounded, attributable errands.',
    images: ['/opengraph-image'],
  },
};

const GOOGLE_FONTS =
  'https://fonts.googleapis.com/css2' +
  '?family=Archivo:wght@400;500;600;700;800;900' +
  '&family=Inter:wght@400;500;600;700' +
  '&family=JetBrains+Mono:wght@400;500;600;700' +
  '&display=swap';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={GOOGLE_FONTS} />
      </head>
      <body>{children}</body>
    </html>
  );
}
