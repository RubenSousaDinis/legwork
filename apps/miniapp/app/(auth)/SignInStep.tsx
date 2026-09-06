'use client';

export type SignInStepProps = {
  /** `null` until `MiniKit.isInstalled()` has been read at sign-in time. */
  mode: 'walletAuth' | 'idkit' | null;
};

/**
 * Between the World ID check and the payout key. Inside World App this is `walletAuth` and
 * passes in a second; outside it there is no wallet to sign with, so the payout address is
 * the identity. The `web sign-in — outside World App` chip that says so is rendered once, by
 * the page, and stays up for the rest of the flow rather than flashing past here.
 */
export function SignInStep({ mode }: SignInStepProps) {
  return (
    <section className="lw-card" data-step="signing-in" data-mode={mode ?? 'unknown'}>
      <p className="lw-section-label">Sign in</p>
      <p data-floor="20">Signing in…</p>
    </section>
  );
}
