'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

/**
 * A div overlay, not `<dialog>`: jsdom 26 has no `showModal()`, and the suite has to
 * exercise open, focus, Escape and close.
 */
export function Modal({ open, onClose, title, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;

    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    document.body.classList.add('lw-modal-open');

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('lw-modal-open');
      previousFocus.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="lw-modal"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="lw-modal__panel"
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="lw-modal__bar">
          <p className="lw-list-label" id={titleId}>
            {title}
          </p>
          <button
            className="lw-button lw-button--ghost"
            data-hit="44"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
