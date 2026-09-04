import type { ReactNode } from 'react';

export type ChipTone = 'neutral' | 'verified' | 'refusal' | 'seeded' | 'demo';

export type ChipProps = {
  tone: ChipTone;
  /** Marks the chip as narrated copy, which never renders below 20 px on the phone. */
  floor?: 20;
  children: ReactNode;
};

/** Mono pill: 1 px border in the semantic colour at .45 alpha over a .1 tint. */
export function Chip({ tone, floor, children }: ChipProps) {
  return (
    <span
      className={`lw-chip lw-chip--${tone}`}
      data-tone={tone}
      {...(floor ? { 'data-floor': String(floor) } : {})}
    >
      {children}
    </span>
  );
}
