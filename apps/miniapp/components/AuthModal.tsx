'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { AuthFlow } from '../app/(auth)/AuthFlow';
import { Modal } from './ui/Modal';

let open = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function openAuthModal(): void {
  open = true;
  emit();
}

export function closeAuthModal(): void {
  open = false;
  emit();
}

/** Tests reset the module store between renders; nothing in the app calls this. */
export function resetAuthModalForTests(): void {
  open = false;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return open;
}

/** Host for the login modal. One instance, in the header nav, so any trigger can open it. */
export function AuthModalHost() {
  const isOpen = useSyncExternalStore(subscribe, getSnapshot, () => false);
  const onClose = useCallback(() => {
    closeAuthModal();
  }, []);

  return (
    <Modal onClose={onClose} open={isOpen} title="Login with World ID">
      {isOpen ? <AuthFlow onDone={closeAuthModal} /> : null}
    </Modal>
  );
}
