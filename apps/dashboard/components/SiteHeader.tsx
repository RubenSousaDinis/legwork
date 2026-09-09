import { LogoMark } from './LogoMark';
import { Wordmark } from './Wordmark';
import { miniappUrl } from '../lib/urls';

export type SiteHeaderCurrent = 'live' | 'agents' | 'deck' | 'about' | 'support';

const LINKS: { href: string; id: SiteHeaderCurrent; label: string }[] = [
  { href: '/live', id: 'live', label: 'live' },
  { href: '/agents', id: 'agents', label: 'agents' },
  { href: '/deck', id: 'deck', label: 'deck' },
  { href: '/about', id: 'about', label: 'about' },
  { href: '/support', id: 'support', label: 'support' },
];

export function SiteHeader({ current }: { current?: SiteHeaderCurrent }) {
  return (
    <header className="site-header">
      <a href="/" className="site-header-brand landing-link">
        <span className="site-header-mark" aria-hidden="true">
          <LogoMark size={28} />
        </span>
        <Wordmark />
      </a>
      <nav className="site-header-nav" aria-label="Site">
        <a href={miniappUrl()} className="site-header-link landing-link">
          worker app ↗
        </a>
        {LINKS.map((link) => (
          <a
            key={link.id}
            href={link.href}
            className="site-header-link landing-link"
            data-current={current === link.id ? 'true' : 'false'}
          >
            {link.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
