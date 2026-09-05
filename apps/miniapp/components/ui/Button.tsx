'use client';

import type { ReactNode } from 'react';

export type ButtonProps = {
  variant: 'primary' | 'ghost' | 'verified';
  /** `md` is the 44 px hit-target floor, `lg` the 56 px block action. */
  size?: 'md' | 'lg';
  full?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  children: ReactNode;
};

/** Block action. Label renders uppercase; radius 10; never below the 44 px hit floor. */
export function Button({
  variant,
  size = 'md',
  full = false,
  disabled = false,
  onClick,
  type = 'button',
  children,
}: ButtonProps) {
  const className = [
    'lw-button',
    `lw-button--${variant}`,
    size === 'lg' ? 'lw-button--lg' : '',
    full ? 'lw-button--full' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={className} data-hit="44" disabled={disabled} onClick={onClick} type={type}>
      {children}
    </button>
  );
}
