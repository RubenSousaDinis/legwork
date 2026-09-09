'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { signOut, useSession } from '../lib/session';
import { AuthModalHost, openAuthModal } from './AuthModal';

const LOGIN_LABEL = 'Login with World ID';
const LOGIN_SHORT = 'Login';

const LINKS = [
  { href: '/', label: 'Tasks' },
  { href: '/earnings', label: 'Earnings' },
  { href: '/about', label: 'About' },
  { href: '/support', label: 'Support' },
] as const;

/**
 * The Tasks tab is the worker's job, so it stays current on the proof, compare and report
 * screens rather than going blank the moment they leave `/`.
 */
export function pathMatchesNav(pathname: string, href: string): boolean {
  if (href === '/') {
    return (
      pathname === '/' ||
      pathname === '/tasks' ||
      pathname.startsWith('/proof/') ||
      pathname.startsWith('/compare/') ||
      pathname.startsWith('/report/')
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The header's links and the one auth control. Login opens the modal; Logout calls the
 * session. Direct children of `.lw-header` — a grid item, not a nested flex row wrapping
 * the brand. On a phone the links pin to the bottom as a tab bar; the auth control stays
 * in the header so a thumb can reach the tabs without the login label wrapping them.
 */
export function SiteNav() {
  const session = useSession();
  const verified = session.status === 'verified';
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname() || '/';

  return (
    <nav className="lw-nav">
      <div className="lw-nav__tabs">
        {LINKS.map((link) => {
          const current = pathMatchesNav(pathname, link.href);
          return (
            <a
              aria-current={current ? 'page' : undefined}
              className={current ? 'lw-nav__link lw-nav__link--current' : 'lw-nav__link'}
              data-hit="44"
              href={link.href}
              key={link.href}
            >
              {link.label}
            </a>
          );
        })}
      </div>
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
          aria-label={LOGIN_LABEL}
          className="lw-button lw-button--verified lw-nav__auth"
          data-hit="44"
          onClick={openAuthModal}
          type="button"
        >
          <span aria-hidden="true" className="lw-nav__auth-full">
            {LOGIN_LABEL}
          </span>
          <span aria-hidden="true" className="lw-nav__auth-short">
            {LOGIN_SHORT}
          </span>
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
