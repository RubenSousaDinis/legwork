'use client';

/**
 * The worker session. T-24 replaces the body of `useSession`; this type is the frozen
 * shape T-25 and T-33 read against, so it does not change with the implementation.
 */
export type SessionState =
  | { status: 'unverified' }
  | { status: 'verifying' }
  | {
      status: 'verified';
      nullifier: string;
      level: string;
      mode: 'walletAuth' | 'idkit';
      worker: string;
      registered: boolean;
    };

/** Stub — always unverified until T-24 implements World ID verify + `walletAuth`. */
export function useSession(): SessionState {
  return { status: 'unverified' };
}
