import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { COMPLETED_LINE, PaidState } from '../../app/proof/PaidState';

/**
 * The released receipt as the design draws it: the teal card, the proof above the money, and
 * the completed line beside the transaction. The guard is T-33's and stays — without a
 * thumbnail this component draws nothing at all, so escrow releasing on its own is not a
 * state this screen can reach.
 */

const RELEASE_TX = `0x${'3b6d9f0247ace13579bdf02468ace135'.repeat(2)}`;
const CAPTURED_AT = '2026-09-06T10:03:00.000Z';

afterEach(cleanup);

describe('the paid state', () => {
  it('paidStateIsTealAndBelowTheProof', () => {
    const paid = render(
      <PaidState
        amountUsdc={3}
        capturedAt={CAPTURED_AT}
        proofThumbnailUrl="blob:legwork/proof"
        releaseTx={RELEASE_TX}
      />,
    );

    const card = paid.container.querySelector('[data-paid-state="released"]') as HTMLElement;
    expect(card.getAttribute('data-tone')).toBe('verified');
    expect(card.className).toContain('lw-paid');

    // DOM order, not a layout promise: the photo is above the figure.
    const image = card.querySelector('img') as HTMLImageElement;
    const released = card.querySelector('[data-released="usdc"]') as HTMLElement;
    expect(image).toBeTruthy();
    expect(image.compareDocumentPosition(released) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const completed = card.querySelector('[data-completed]') as HTMLElement;
    expect(completed.textContent?.startsWith(COMPLETED_LINE)).toBe(true);
    expect(completed.textContent?.startsWith('+1 completed')).toBe(true);

    cleanup();

    const empty = render(
      <PaidState amountUsdc={3} capturedAt={CAPTURED_AT} proofThumbnailUrl={null} releaseTx={RELEASE_TX} />,
    );
    const none = empty.container.querySelector('[data-paid-state="none"]') as HTMLElement;
    expect(none).not.toBeNull();
    expect(none.childNodes.length).toBe(0);
    expect(empty.container.textContent).toBe('');
  });
});
