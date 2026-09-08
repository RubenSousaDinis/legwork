import { Wordmark } from './Wordmark';

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
        <Wordmark />
      </a>
      <nav className="site-header-nav" aria-label="Site">
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
