import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../mocks/server';

vi.mock('@worldcoin/minikit-js', () => ({
  MiniKit: { install: vi.fn(), isInstalled: vi.fn(() => false), walletAuth: vi.fn(), user: {} },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const { resetSessionForTests, setSessionState } = await import('../../lib/session');
const { importPrivateKey, TREASURY_ADDRESS } = await import('../../lib/workerKey');
const { default: EarningsPage } = await import('../../app/earnings/page');
const { CONFIRM, GAS_NOTE, REVIEW, TESTNET_NOTE, BELOW_MINIMUM } = await import(
  '../../app/earnings/WithdrawForm'
);

/**
 * The withdraw form on `/earnings`, from the worker's side of the glass.
 *
 * Two things have to be on the screen before a signature exists, and both of them are about a
 * worker knowing what they are about to agree to: the exact split of the amount they typed,
 * and the destination in full. An ellipsis in an address is how money goes somewhere nobody
 * meant, so the confirm step spells all 42 characters.
 */

/** A published test vector (Anvil account #0). Not a key to anything that holds money. */
const KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const WORKER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;

/** 42 characters, and every one of them has to survive to the confirm step. */
const DESTINATION = '0x1234567890AbcdEF1234567890aBcdef12345678' as const;

const MIRROR = {
  nullifier: '1001',
  level: 'orb',
  mode: 'walletAuth' as const,
  worker: WORKER,
  registered: true,
};

beforeEach(() => {
  localStorage.clear();
  resetSessionForTests();
  importPrivateKey(KEY);
  setSessionState({ status: 'verified', ...MIRROR });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetSessionForTests();
});

/** The form, rendered and past the `GET /me/earnings` await. */
async function openWithdraw(): Promise<HTMLElement> {
  render(<EarningsPage />);
  return (await waitFor(() => {
    const node = document.querySelector('[data-withdraw="form"]');
    expect(node).not.toBeNull();
    return node;
  })) as HTMLElement;
}

function type(selector: string, value: string): void {
  const input = document.querySelector(selector) as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
}

describe('withdrawing from /earnings', () => {
  it('earningsShowsTheSplitBeforeConfirming', async () => {
    await openWithdraw();

    type('[data-withdraw="amount-input"]', '3.00');

    // 3.00 is 2.94 to the worker and 0.06 to Legwork, and the worker reads both figures
    // before there is a signature anywhere on this phone.
    const split = await waitFor(() => {
      const node = document.querySelector('[data-withdraw="split"]');
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });
    expect(split.textContent).toContain('you receive 2.94');
    expect(split.textContent).toContain('Legwork keeps 0.06');

    // Still on the form: nothing has been signed and nothing has been sent.
    expect(document.querySelector('[data-withdraw="destination"]')).toBeNull();
    expect(screen.queryByText(CONFIRM)).toBeNull();
    expect(screen.getByText(REVIEW)).toBeTruthy();

    // The 2 % is Legwork's whole fee here and is not the 0.45 a hiring agent pays: neither
    // that figure nor the 3.45 belongs anywhere near this card.
    const card = document.querySelector('[data-withdraw="form"]') as HTMLElement;
    expect(card.textContent).not.toContain('0.45');
    expect(card.textContent).not.toContain('3.45');

    // And the screen says what the money is, beside the amount rather than in fine print.
    expect(card.textContent).toContain(TESTNET_NOTE);
    expect(card.textContent).toContain(GAS_NOTE);

    // The floor is refused with the number in it, and nothing is submitted.
    type('[data-withdraw="amount-input"]', '0.99');
    type('[data-withdraw="destination-input"]', DESTINATION);
    fireEvent.click(screen.getByText(REVIEW));
    const refusal = await screen.findByText(BELOW_MINIMUM);
    expect(refusal.textContent).toContain('1.00');
    expect(document.querySelector('[data-withdraw="destination"]')).toBeNull();
  });

  it('earningsNamesTheDestinationInFull', async () => {
    let sent: Record<string, unknown> | null = null;
    server.use(
      http.post('*/api/me/withdraw', async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          payout_tx: `0x${'a'.repeat(64)}`,
          fee_tx: `0x${'b'.repeat(64)}`,
          payout_usdc: 2.94,
          fee_usdc: 0.06,
        });
      }),
    );

    await openWithdraw();
    type('[data-withdraw="destination-input"]', DESTINATION);
    type('[data-withdraw="amount-input"]', '3.00');
    fireEvent.click(screen.getByText(REVIEW));

    const shown = await waitFor(() => {
      const node = document.querySelector('[data-withdraw="destination"]');
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });

    // All 42 characters, character for character, and no ellipsis of any spelling.
    const text = shown.textContent ?? '';
    expect(text).toBe(DESTINATION);
    expect(text).toHaveLength(42);
    expect(text).not.toContain('…');
    expect(text).not.toContain('...');
    expect(text).not.toContain('…');

    // Confirming signs on the phone and sends what the phone built. The destination the API
    // is handed is the one that was on the screen, in both the body and the signed leg.
    fireEvent.click(screen.getByText(CONFIRM));
    await waitFor(() => expect(sent).not.toBeNull());

    const body = sent as unknown as {
      to: string;
      payout: { to: string; value: string };
      fee: { to: string; value: string };
    };
    expect(body.to).toBe(DESTINATION);
    expect(body.payout.to).toBe(DESTINATION);
    expect(body.payout.value).toBe('2940000');
    // And the fee leg still pays the treasury, which no part of this screen can name.
    expect(body.fee.to).toBe(TREASURY_ADDRESS);
    expect(body.fee.value).toBe('60000');

    // The receipt repeats the address in full rather than making the worker trust a prefix.
    const receipt = await waitFor(() => {
      const node = document.querySelector('[data-withdraw="done"] [data-withdraw="destination"]');
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });
    expect(receipt.textContent).toBe(DESTINATION);
  });

  it('earningsSaysTheFeeIsPendingRatherThanThatTheWithdrawalFailed', async () => {
    server.use(
      http.post('*/api/me/withdraw', () =>
        HttpResponse.json({
          payout_tx: `0x${'a'.repeat(64)}`,
          fee_tx: null,
          payout_usdc: 2.94,
          fee_usdc: 0.06,
          fee_pending: true,
        }),
      ),
    );

    await openWithdraw();
    type('[data-withdraw="destination-input"]', DESTINATION);
    type('[data-withdraw="amount-input"]', '3.00');
    fireEvent.click(screen.getByText(REVIEW));
    fireEvent.click(await screen.findByText(CONFIRM));

    const note = await waitFor(() => {
      const node = document.querySelector('[data-withdraw="fee-pending"]');
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });

    // The worker is told they have their money and that the outstanding leg is ours.
    expect(note.textContent).toContain('2.94');
    expect(note.textContent).toContain('not been taken yet');
    expect(document.querySelector('[data-error="withdraw"]')).toBeNull();
  });

  it('earningsRefusesAForeignSignatureWithoutBlamingTheWorkerForATypo', async () => {
    server.use(
      http.post('*/api/me/withdraw', () =>
        HttpResponse.json({ error: 'forbidden', reason: 'not_the_signer' }, { status: 403 }),
      ),
    );

    await openWithdraw();
    type('[data-withdraw="destination-input"]', DESTINATION);
    type('[data-withdraw="amount-input"]', '3.00');
    fireEvent.click(screen.getByText(REVIEW));
    fireEvent.click(await screen.findByText(CONFIRM));

    const error = await waitFor(() => {
      const node = document.querySelector('[data-error="withdraw"]');
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });
    expect(error.textContent).toContain('Nothing was submitted');
    // Back on the confirm step, with the address still there to check.
    expect(document.querySelector('[data-withdraw="destination"]')?.textContent).toBe(DESTINATION);
  });
});
