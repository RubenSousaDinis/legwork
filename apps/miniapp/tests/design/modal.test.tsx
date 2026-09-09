import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Modal } from '../../components/ui/Modal';

function Harness() {
  const [open, setOpen] = useState(false);
  const onClose = useCallback(() => setOpen(false), []);
  return (
    <>
      <button data-hit="44" onClick={() => setOpen(true)} type="button">
        Open
      </button>
      <Modal onClose={onClose} open={open} title="Login with World ID">
        <p>inside the panel</p>
      </Modal>
    </>
  );
}

afterEach(cleanup);

describe('modal', () => {
  it('loginModalTrapsFocusAndClosesOnEscape', async () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);

    const panel = document.querySelector('.lw-modal__panel');
    expect(panel).not.toBeNull();
    expect(panel?.tagName).not.toBe('DIALOG');
    expect(document.querySelector('dialog')).toBeNull();
    expect(document.querySelector('.lw-modal')?.tagName).toBe('DIV');

    await waitFor(() => expect(document.activeElement).toBe(panel));
    expect(document.body.classList.contains('lw-modal-open')).toBe(true);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('.lw-modal')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.classList.contains('lw-modal-open')).toBe(false);
  });
});
