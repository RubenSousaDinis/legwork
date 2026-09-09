import type { Metadata, Viewport } from 'next';
import { MiniKitProvider } from '../components/MiniKitProvider';
import { SiteNav } from '../components/SiteNav';
import { VerifiedState } from '../components/VerifiedState';
import './globals.css';

export const metadata: Metadata = {
  title: 'Legwork — worker',
  description: 'Claim a nearby task, photograph the proof, get paid in USDC on Base Sepolia.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#faf9f5',
};

const FONTS =
  'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap';

/**
 * The in-UI glyph — DESIGN-SPEC "Iconography": no icon font, no emoji, no filled icon set.
 * A bare footprint, typed as two ellipses, always in the verified teal.
 *
 * The header stays a flat list of children (brand, nav, verified state) so the verified
 * chip stays above the fold. On a phone the nav's links pin to the bottom; CSS does that,
 * not a second header tree.
 */
function Footprint() {
  return (
    <svg
      aria-hidden="true"
      className="lw-footprint"
      height="15"
      viewBox="0 0 24 24"
      width="15"
    >
      <ellipse cx="9" cy="9" rx="4.2" ry="6" transform="rotate(-14 9 9)" />
      <ellipse cx="15.5" cy="19" rx="2.6" ry="3.4" transform="rotate(-14 15.5 19)" />
    </svg>
  );
}

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
