import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PaidState } from '../../app/proof/PaidState';

/**
 * The one image the submission must never produce is escrow releasing on its own. The guard
 * is in the component, so no caller can render the money without the photo above it.
 */

const RELEASE_TX = `0x${'3b6d9f0247ace13579bdf02468ace135'.repeat(2)}`;
const CAPTURED_AT = '2026-09-06T10:03:00.000Z';

afterEach(cleanup);

describe('PaidState', () => {
  it('paidStateRequiresProofAbove', () => {
    const empty = render(
      <PaidState
        amountUsdc={3}
        capturedAt={CAPTURED_AT}
        proofThumbnailUrl={null}
        releaseTx={RELEASE_TX}
      />,
    );

    // No photo, no paid state: an empty container, not a card with the money in it.
    expect(empty.container.textContent).toBe('');
    expect(empty.container.querySelector('img')).toBeNull();
    cleanup();

    const paid = render(
      <PaidState
        amountUsdc={3}
        capturedAt={CAPTURED_AT}
        proofThumbnailUrl="blob:legwork/proof"
        releaseTx={RELEASE_TX}
      />,
    );

    const card = paid.container.querySelector('[data-paid-state="released"]') as HTMLElement;
    const image = card.querySelector('img') as HTMLImageElement;
    const released = card.querySelector('[data-released="usdc"]') as HTMLElement;

    expect(image).toBeTruthy();
    expect(released.textContent).toBe('Released · 3.00 USDC');

    // Above it, inside the same card — DOM order, not a layout promise.
    expect(image.closest('[data-paid-state="released"]')).toBe(card);
    expect(image.compareDocumentPosition(released) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(card.textContent).toContain('testnet USDC — not spendable');
    expect(card.textContent).toContain('+1 completed');
  });
});
