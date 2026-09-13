'use client';

import { credentialLabel } from '@legwork/shared';
import type { RpContext } from '@worldcoin/idkit-core';
import { Chip } from '../../components/ui/Chip';
import type { CredentialLevel } from '../../lib/env';
import {
  DEFAULT_IDKIT_ENVIRONMENT,
  IdkitVerify,
  type IdkitEnvironment,
  type VerifyResponse,
} from '../../lib/worldid';

export type VerifyStepProps = {
  rpContext: RpContext | null;
  open: boolean;
  level: CredentialLevel;
  environment?: IdkitEnvironment;
  onOpenChange: (open: boolean) => void;
  onVerified: (response: VerifyResponse) => void;
  onFailed: (error: unknown) => void;
};

export const LOGIN_SELFIE_CAPTION =
  'Selfie Check — scan the QR with World ID Sandbox on your phone, or continue in the app.';

export const LOGIN_SELFIE_CAPTION_PRODUCTION =
  'Selfie Check — scan the QR with World App on your phone, or continue in the app.';

export const LOGIN_ORB_CAPTION =
  'Orb — scan the QR with World ID Sandbox on your phone, or continue in the app.';

export const LOGIN_ORB_CAPTION_PRODUCTION =
  'Orb — scan the QR with World App on your phone, or continue in the app.';

export function loginSelfieCaption(environment: IdkitEnvironment): string {
  return environment === 'sandbox' ? LOGIN_SELFIE_CAPTION : LOGIN_SELFIE_CAPTION_PRODUCTION;
}

export function loginOrbCaption(environment: IdkitEnvironment): string {
  return environment === 'sandbox' ? LOGIN_ORB_CAPTION : LOGIN_ORB_CAPTION_PRODUCTION;
}

/** The caption names the credential actually being asked for — Orb after a fallback. */
export function loginCaption(level: CredentialLevel, environment: IdkitEnvironment): string {
  return level === 'orb' ? loginOrbCaption(environment) : loginSelfieCaption(environment);
}

export const LOGIN_SELFIE_DESCRIPTION = 'Confirm a live person is signing in';

export const LOGIN_ORB_DESCRIPTION = 'Confirm one account per person';

export function loginDescription(level: CredentialLevel): string {
  return level === 'orb' ? LOGIN_ORB_DESCRIPTION : LOGIN_SELFIE_DESCRIPTION;
}

/**
 * Hosts the IDKit widget once the RP context is in hand. The widget is the only thing on
 * screen that talks to World; the API's answer to `POST /idkit/verify`, not the widget's, is
 * what moves the flow on.
 *
 * The default environment is production, so the QR and the deep link open the World App the
 * worker already has. Sandbox stays reachable for the prize-track test path — a remembered
 * choice, or `startVerify('sandbox')`.
 */
export function VerifyStep({
  rpContext,
  open,
  level,
  environment = DEFAULT_IDKIT_ENVIRONMENT,
  onOpenChange,
  onVerified,
  onFailed,
}: VerifyStepProps) {
  return (
    <section className="lw-card" data-step="verifying">
      <p className="lw-list-label">World ID</p>
      <p className="lw-body" data-floor="20">
        {loginCaption(level, environment)}
      </p>
      <p className="lw-chips">
        <Chip tone="neutral" floor={20}>
          {credentialLabel(level)}
        </Chip>
      </p>
      {rpContext === null ? null : (
        <IdkitVerify
          action_description={loginDescription(level)}
          environment={environment}
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
