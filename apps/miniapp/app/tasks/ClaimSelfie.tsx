'use client';

import { credentialLabel, SELFIE } from '@legwork/shared';
import type { RpContext } from '@worldcoin/idkit-core';
import { Chip } from '../../components/ui/Chip';
import { useSession } from '../../lib/session';
import {
  IdkitVerify,
  rememberedIdkitEnvironment,
  type VerifyResponse,
} from '../../lib/worldid';

/**
 * Claim-time Selfie Check. Orb already proved uniqueness at registration; this is the
 * live-person / abuse-prevention signal the World prize asks for. IDKit shows a QR on
 * desktop and a deep link on a phone PWA; inside World App it uses the bridge.
 */

export const CLAIM_SELFIE_CAPTION =
  'Selfie Check — scan the QR with World ID Sandbox on your phone, or continue in the app.';

export const CLAIM_SELFIE_CAPTION_PRODUCTION =
  'Selfie Check — scan the QR with World App on your phone, or continue in the app.';

export const CLAIM_SELFIE_DESCRIPTION = 'Confirm a live person is claiming this task';

export type ClaimSelfieProps = {
  open: boolean;
  rpContext: RpContext | null;
  onOpenChange: (open: boolean) => void;
  onVerified: (response: VerifyResponse) => void;
  onFailed: (error: unknown) => void;
};

export function ClaimSelfie({
  open,
  rpContext,
  onOpenChange,
  onVerified,
  onFailed,
}: ClaimSelfieProps) {
  const session = useSession();
  const worker = session.status === 'verified' ? session.worker : '';
  const environment = rememberedIdkitEnvironment();
  const caption = environment === 'sandbox' ? CLAIM_SELFIE_CAPTION : CLAIM_SELFIE_CAPTION_PRODUCTION;

  if (rpContext === null) return null;

  return (
    <div data-claim="selfie">
      {open ? (
        <>
          <p className="lw-body" data-floor="20">
            {caption}
          </p>
          <p className="lw-chips">
            <Chip tone="neutral" floor={20}>
              {credentialLabel(SELFIE)}
            </Chip>
          </p>
        </>
      ) : null}
      <IdkitVerify
        action_description={CLAIM_SELFIE_DESCRIPTION}
        environment={environment}
        level="selfie"
        onFailed={onFailed}
        onOpenChange={onOpenChange}
        onVerified={onVerified}
        open={open}
        rpContext={rpContext}
        signal={worker}
      />
    </div>
  );
}
