import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AdminPanel } from './AdminPanel';

/**
 * `/admin` — env-gated from the first commit. The flag is read as the literal
 * `process.env.NEXT_PUBLIC_ADMIN_UI` because that is the only form Next inlines; a
 * dynamic key would read `undefined` in the browser and gate nothing.
 *
 * The gate is a server decision made here, before `AdminPanel` is ever in the tree —
 * anything other than `'1'`, unset included, is a 404 and no panel is rendered at all.
 * The admin key itself is never an env of this app: the operator pastes it.
 */
export const metadata: Metadata = {
  title: 'Legwork · operator',
  robots: { index: false },
};

export default function AdminPage() {
  if (process.env.NEXT_PUBLIC_ADMIN_UI !== '1') notFound();
  return <AdminPanel />;
}
