import type { MetadataRoute } from 'next';

/**
 * Installable on the operator's phone so a screenshot or screen recording has no
 * browser chrome (URL bar, tab strip). `display: standalone` is the whole point.
 *
 * No service worker. Chrome no longer requires one to install, iOS never did, and a
 * fetch handler here would cache `/api/*` — the live Task API — which this app must
 * not do. Add-to-Home-Screen on iOS/Brave is Share → Add to Home Screen after this
 * ships; World App's own webview is unchanged.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Legwork',
    short_name: 'Legwork',
    description: 'Claim a nearby task, photograph the proof, get paid in USDC on Base Sepolia.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    lang: 'en',
    background_color: '#faf9f5',
    theme_color: '#faf9f5',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
