import type { Metadata, Viewport } from 'next';
import { Footprint } from '../components/Footprint';
import { MiniKitProvider } from '../components/MiniKitProvider';
import { SiteNav } from '../components/SiteNav';
import { VerifiedState } from '../components/VerifiedState';
import './globals.css';

export const metadata: Metadata = {
  title: 'Legwork — worker',
  applicationName: 'Legwork',
  description: 'Claim a nearby task, photograph the proof, get paid in USDC on Base Sepolia.',
  appleWebApp: {
    capable: true,
    title: 'Legwork',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#faf9f5',
};

const FONTS =
  'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap';

/*
 * The header stays a flat list of children (brand, nav, verified state) so the verified
 * chip stays above the fold. On a phone the nav's links pin to the bottom; CSS does that,
 * not a second header tree. The footprint glyph is `components/Footprint.tsx` — the
 * released receipt draws the same mark at the end of its route line.
 */

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>
        <MiniKitProvider>
          <header className="lw-header">
            <span className="lw-header__brand">
              <span className="lw-wordmark">LEGWORK</span>
              <Footprint />
            </span>
            <SiteNav />
            <VerifiedState />
          </header>
          <main className="lw-main">{children}</main>
        </MiniKitProvider>
      </body>
    </html>
  );
}
