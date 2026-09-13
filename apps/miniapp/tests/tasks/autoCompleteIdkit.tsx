import { useEffect } from 'react';
import { IDKIT_RESULT_FIXTURE } from '../fixtures';

const FACE_RESULT = { ...IDKIT_RESULT_FIXTURE, verification_level: 'face' };

/**
 * Stand-in for IDKit's widget in task-list tests: when it opens, it completes a Selfie Check
 * the way the real widget would after World App / Sandbox returns — `handleVerify` then
 * `onSuccess` — so existing CLAIM clicks still reach `POST /tasks/:id/claim`.
 */
export function AutoIdkitRequestWidget(props: {
  open: boolean;
  handleVerify?: (result: unknown) => Promise<void> | void;
  onSuccess: (result: unknown) => Promise<void> | void;
}) {
  // Complete once per open. The verify/success callbacks from that opening stay valid.
  useEffect(() => {
    if (!props.open) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        await props.handleVerify?.(FACE_RESULT);
        if (!cancelled) await props.onSuccess(FACE_RESULT);
      } catch {
        // The widget reports the failure; it never calls onSuccess after one.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.open]);
  return props.open ? <div data-idkit="claim-selfie" /> : null;
}
