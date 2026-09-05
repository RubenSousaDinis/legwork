import type { ReactNode } from 'react';

export type ChipTone = 'neutral' | 'verified' | 'refusal' | 'seeded' | 'demo';

export interface ChipProps {
  tone?: ChipTone;
  /**
   * The legibility floor in design px. Honesty chips are brand elements, never fine
   * print, so 32 is the default and every chip carries the attribute in both modes.
   */
  floor?: 24 | 32;
  children: ReactNode;
}

export function Chip({ tone = 'neutral', floor = 32, children }: ChipProps) {
  return (
    <span className={`chip chip-${tone}`} data-tone={tone} data-floor={String(floor)}>
      {children}
    </span>
  );
}
