import type { ReactNode } from 'react';

export type MonoTagProps = { children: ReactNode };

/** Task-type tag: mono over the `--paper-100` fill, radius 6. */
export function MonoTag({ children }: MonoTagProps) {
  return <span className="lw-monotag">{children}</span>;
}
