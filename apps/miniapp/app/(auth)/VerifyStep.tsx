'use client';

import type { RpContext } from '@worldcoin/idkit-core';
import { Chip } from '../../components/ui/Chip';
import type { CredentialLevel } from '../../lib/env';
import { IdkitVerify, type VerifyResponse } from '../../lib/worldid';

export type VerifyStepProps = {
  rpContext: RpContext | null;
  open: boolean;
  level: CredentialLevel;
  onOpenChange: (open: boolean) => void;
  onVerified: (response: VerifyResponse) => void;
  onFailed: (error: unknown) => void;
};

/**
 * Hosts the IDKit widget once the RP context is in hand. The widget is the only thing on
 * screen that talks to World; the API's answer to `POST /idkit/verify`, not the widget's, is
 * what moves the flow on.
 */
export function VerifyStep({
  rpContext,
  open,
  level,
  onOpenChange,
  onVerified,
  onFailed,
}: VerifyStepProps) {
  return (
    <section className="lw-card" data-step="verifying">
      <p className="lw-section-label">World ID</p>
      <p data-floor="20">Verifying — finish the check in World App.</p>
      <Chip tone="neutral" floor={20}>
        {level === 'selfie' ? 'sandbox Selfie Check' : 'sandbox World ID'}
      </Chip>
      {rpContext === null ? null : (
        <IdkitVerify
          level={level}
          onFailed={onFailed}
          onOpenChange={onOpenChange}
          onVerified={onVerified}
          open={open}
          rpContext={rpContext}
        />
      )}
    </section>
  );
}
