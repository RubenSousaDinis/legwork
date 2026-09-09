'use client';

import { useState } from 'react';
import { signOut, useSession } from '../lib/session';
import { AuthModalHost, openAuthModal } from './AuthModal';

const LOGIN_LABEL = 'Login with World ID';

const LINKS = [
  { href: '/', label: 'Tasks' },
  { href: '/earnings', label: 'Earnings' },
  { href: '/about', label: 'About' },
  { href: '/support', label: 'Support' },
] as const;

/**
 * The header's links and the one auth control. Login opens the modal; Logout calls the
 * session. Direct children of `.lw-header` — a grid item, not a nested flex row wrapping
 * the brand.
 */
export function SiteNav() {
  const session = useSession();
  const verified = session.status === 'verified';
  const [error, setError] = useState<string | null>(null);

  return (
    <nav className="lw-nav">
      {LINKS.map((link) => (
        <a className="lw-nav__link" data-hit="44" href={link.href} key={link.href}>
          {link.label}
        </a>
      ))}
      {verified ? (
        <button
          className="lw-button lw-button--ghost lw-nav__auth"
          data-hit="44"
          onClick={() => {
            setError(null);
            void signOut().catch((thrown) => {
              setError(thrown instanceof Error ? thrown.message : String(thrown));
            });
          }}
          type="button"
        >
          Logout
        </button>
      ) : (
        <button
          className="lw-button lw-button--verified lw-nav__auth"
          data-hit="44"
          onClick={openAuthModal}
          type="button"
        >
          {LOGIN_LABEL}
        </button>
      )}
      {error === null ? null : (
        <p className="lw-error-line" data-floor="20" data-nav="logout-error">
          {error}
        </p>
      )}
      <AuthModalHost />
    </nav>
  );
}
