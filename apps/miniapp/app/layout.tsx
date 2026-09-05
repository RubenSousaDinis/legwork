import type { Metadata, Viewport } from 'next';
import { MiniKitProvider } from '../components/MiniKitProvider';
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
};

const FONTS =
  'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap';

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
            <span className="lw-wordmark">LEGWORK</span>
            <VerifiedState />
          </header>
          <main className="lw-main">{children}</main>
        </MiniKitProvider>
      </body>
    </html>
  );
}
