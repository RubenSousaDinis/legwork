import type { CredentialLevel } from '@legwork/shared';
import { TRUST_MODEL_CLOSER, resolvedCredentialLevel, trustModelSentence } from './copy';

/** The phrase the sentence bolds. Held once so the split below has something to match. */
const BOUNDED = 'bounded, attributable work';

/**
 * The trust model, rendered wherever it appears, at the credential the deployment is on.
 *
 * It reads the level itself rather than taking a constant, because the constant was pinned to
 * `orb` and this component is what `/` renders: a landing that kept claiming uniqueness after
 * the credential moved would be the one surface still saying a thing the credential cannot
 * support. `level` is a prop only so tests can render both without an environment.
 */
export function TrustModel({
  closer = true,
  level = resolvedCredentialLevel(),
}: {
  closer?: boolean;
  level?: CredentialLevel;
}) {
  const sentence = trustModelSentence(level);
  const [before, after] = sentence.split(BOUNDED);

  return (
    <>
      <p className="landing-prose" data-floor="24">
        {/* If the phrase ever leaves the sentence, `after` is `undefined` and a naive split
            would drop half the paragraph with no error. Render it whole instead. */}
        {after === undefined ? (
          sentence
        ) : (
          <>
            {before}
            <strong>{BOUNDED}</strong>
            {after}
          </>
        )}
      </p>
      {closer ? (
        <p className="landing-closer" data-floor="24">
          {TRUST_MODEL_CLOSER}
        </p>
      ) : null}
    </>
  );
}
