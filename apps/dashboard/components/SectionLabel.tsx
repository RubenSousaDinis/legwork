import type { ReactNode } from 'react';

/** Section labels are structure, not narration, so they carry no legibility floor. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="section-label">{children}</div>;
}
