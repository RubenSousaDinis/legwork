import type { TaskType } from '@legwork/shared';

export interface MonoTagProps {
  type: TaskType | 'free-text';
}

/** Task types render verbatim; the free-text pseudo-type reads `free text`. */
export function MonoTag({ type }: MonoTagProps) {
  return (
    <span className="mono-tag" data-type={type}>
      {type === 'free-text' ? 'free text' : type}
    </span>
  );
}
