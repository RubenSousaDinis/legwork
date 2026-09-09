import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '../../app/manifest';

const ROOT = join(import.meta.dirname, '..', '..');

/**
 * The installable shell is what lets a phone screenshot skip Brave's URL bar.
 * Asserted as files and as the manifest object Next serves at `/manifest.webmanifest`.
 */
describe('pwa', () => {
  it('installsStandaloneWithoutBrowserChrome', () => {
    const webApp = manifest();
    expect(webApp.display).toBe('standalone');
    expect(webApp.start_url).toBe('/');
    expect(webApp.scope).toBe('/');
    expect(webApp.short_name).toBe('Legwork');
    expect(webApp.name).toBe('Legwork');
    expect(webApp.theme_color).toBe('#faf9f5');
    expect(webApp.background_color).toBe('#faf9f5');
    expect(webApp.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }),
        expect.objectContaining({ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }),
      ]),
    );
    expect(existsSync(join(ROOT, 'public', 'icon-192.png'))).toBe(true);
    expect(existsSync(join(ROOT, 'public', 'icon-512.png'))).toBe(true);
  });

  it('appleWebAppCapableInLayout', () => {
    const layout = readFileSync(join(ROOT, 'app', 'layout.tsx'), 'utf8');
    expect(layout).toContain('appleWebApp');
    expect(layout).toContain('capable: true');
    expect(layout).toContain("title: 'Legwork'");
    expect(layout).toContain("statusBarStyle: 'default'");
    expect(layout).not.toMatch(/navigator\.serviceWorker/);
    expect(existsSync(join(ROOT, 'public', 'sw.js'))).toBe(false);
  });
});
