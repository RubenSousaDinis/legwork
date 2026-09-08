import { TRUST_MODEL, TRUST_MODEL_CLOSER } from './copy';

export function TrustModel({ closer = true }: { closer?: boolean }) {
  const [before, after] = TRUST_MODEL.split('bounded, attributable work');
  return (
    <>
      <p className="landing-prose" data-floor="24">
        {before}
        <strong>bounded, attributable work</strong>
        {after}
      </p>
      {closer ? (
        <p className="landing-closer" data-floor="24">
          {TRUST_MODEL_CLOSER}
        </p>
      ) : null}
    </>
  );
}
