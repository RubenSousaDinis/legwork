import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GEO_ERROR,
  cameraFile,
  geolocationAt,
  geolocationFailing,
  recordProofRequests,
  stubGeolocation,
  stubImagePipeline,
  type ProofRequests,
} from './harness';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: replace }) }));

const { VerifyOpenProof } = await import('@legwork/shared');
const { PROOFS_RESPONSE, TASK_RELEASED } = await import('../../mocks/handlers');
const { setScenario } = await import('../../mocks/scenarios');
const { ACTIVE_CLAIM_KEY } = await import('../../app/tasks/activeClaim');
const { ProofFlow } = await import('../../app/proof/ProofFlow');

/**
 * The beat the submission rests on: photograph the door, hand it in, get paid — with the
 * downgrade as a first-class path rather than an afterthought, because World App exposes no
 * location permission and a webview with no fix is the expected case.
 */

const TASK_ID = '1024';
const CLAIM = {
  task_id: TASK_ID,
  claim_expires_at: '2026-09-06T10:22:00.000Z',
  submit_deadline: '2026-09-06T10:52:00.000Z',
  tx: `0x${'0c1d2e3f405162738495a6b7c8d9eaf0'.repeat(2)}`,
};

/** Before the fixture's deadline, so the header's countdown is running rather than at 00:00. */
const NOW = '2026-09-06T09:52:00.000Z';

const PAID_FOR_THE_PROOF =
  "you are paid for the proof, not the answer — 'closed' pays the same as 'open'";
const NO_PEOPLE = "don't photograph people";
const GPS_CHIP = 'GPS unavailable in webview — disclosed';

let requests: ProofRequests;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(ACTIVE_CLAIM_KEY, JSON.stringify(CLAIM));
  replace.mockClear();
  stubImagePipeline();
  requests = recordProofRequests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
  cleanup();
});

/** Renders the screen and waits for `GET /tasks/:id` to say which answer toggle to draw. */
async function openProofScreen(): Promise<void> {
  render(<ProofFlow claim={CLAIM} taskId={TASK_ID} />);
  await screen.findByText('verify-open');
}

/** Step 1, all the way to the thumbnail — the canvas re-encode is awaited in between. */
async function takeThePhoto(): Promise<void> {
  const input = document.querySelector('[data-capture="photo"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [cameraFile()] } });
  await waitFor(() => expect(document.querySelector('[data-thumbnail="proof"]')).not.toBeNull());
}

function chooseAnswer(option: string): void {
  const button = document.querySelector(`[data-answer="verify-open"] [data-option="${option}"]`);
  fireEvent.click(button as HTMLButtonElement);
}

describe('the proof screen', () => {
  it('copyLinesPresent', async () => {
    stubGeolocation(geolocationFailing(GEO_ERROR.TIMEOUT));
    await openProofScreen();

    // Under the capture button, before anything has been photographed.
    expect(screen.getByText(PAID_FOR_THE_PROOF)).toBeTruthy();
    expect(screen.getByText(NO_PEOPLE)).toBeTruthy();

    // And still there with the photo taken and the answer chosen — never behind a step.
    await takeThePhoto();
    await screen.findByText(GPS_CHIP);
    chooseAnswer('closed');

    expect(screen.getByText(PAID_FOR_THE_PROOF)).toBeTruthy();
    expect(screen.getByText(NO_PEOPLE)).toBeTruthy();
    expect(screen.getByText('SUBMIT')).toBeTruthy();
  });

  it('downgradePathSubmits', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(NOW) });
    stubGeolocation(geolocationFailing(GEO_ERROR.TIMEOUT));
    await openProofScreen();
    await takeThePhoto();

    // The fix failed, so the panel and its chip are up before the worker taps anything.
    await screen.findByText('Location unavailable in this webview — disclosed on the receipt');
    expect(screen.getByText(GPS_CHIP)).toBeTruthy();
    expect(screen.getByText('Retry location')).toBeTruthy();

    // SUBMIT stays down until the worker has confirmed and answered.
    const submit = screen.getByText('SUBMIT') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.click(screen.getByText('I am at the place'));
    chooseAnswer('closed');
    await waitFor(() => expect((screen.getByText('SUBMIT') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText('SUBMIT'));

    await waitFor(() => expect(requests.proofs.length).toBe(1));
    const form = requests.proofs[0] as FormData;
    expect(form.get('gps_unavailable')).toBe('true');
    expect(form.get('worker_confirmed_at_place')).toBe('true');
    // Not an empty string, not a zero — no coordinate is sent at all.
    expect(form.get('lat')).toBeNull();
    expect(form.get('lon')).toBeNull();
    expect(form.get('accuracy_m')).toBeNull();
    expect(form.get('file')).toBeTruthy();

    await waitFor(() => expect(requests.submits.length).toBe(1));
    const body = requests.submits[0] as Record<string, unknown>;

    // The invariant `gps === null ⇔ gps_unavailable === true`, enforced by the schema itself.
    const proof = VerifyOpenProof.parse(body);
    expect(proof.gps).toBeNull();
    expect(proof.gps_unavailable).toBe(true);
    expect(proof.worker_confirmed_at_place).toBe(true);
    expect(proof.answer).toBe('closed');
    expect(proof.captured_at).toBe(PROOFS_RESPONSE.captured_at);

    // §13: the route names the field `proofHash`, the proof schema names it `photo_hash`,
    // and the API checks they are the same value. Both go, both equal.
    expect(body.proofHash).toBe(PROOFS_RESPONSE.proofHash);
    expect(proof.photo_hash).toBe(PROOFS_RESPONSE.proofHash);

    // The claim is spent: this task is not one the worker can walk back to.
    await waitFor(() => expect(localStorage.getItem(ACTIVE_CLAIM_KEY)).toBeNull());
    expect(await screen.findByText('Submitted · waiting for release')).toBeTruthy();
  });

  it('amountNeverDeducted', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(NOW) });
    setScenario({ task: 'released' });
    stubGeolocation(geolocationAt(39.7495, -8.8078, 12));

    await openProofScreen();
    await takeThePhoto();

    // The other path: a real fix, shown as ±m and a coordinate rounded to 3 decimals.
    await screen.findByText('±12 m');
    expect(screen.getByText('39.749, -8.808')).toBeTruthy();

    chooseAnswer('open');
    await waitFor(() => expect((screen.getByText('SUBMIT') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText('SUBMIT'));

    const card = await waitFor(() => {
      const node = document.querySelector('[data-paid-state="released"]');
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });

    // `amount_usdc` from the API, printed. The worker keeps the whole posted rate: the agent
    // pays 3.45, escrow locks 3.45, and the 0.45 fee rides on top rather than coming out.
    expect(TASK_RELEASED.amount_usdc).toBe(3);
    expect(card.querySelector('[data-released="usdc"]')?.textContent).toBe('Released · 3.00 USDC');
    expect(card.textContent).not.toMatch(/2\.\d/);
    expect(card.querySelector('img')).not.toBeNull();

    // The fix path sends the coordinate and no downgrade flags.
    const form = requests.proofs[0] as FormData;
    expect(form.get('lat')).toBe('39.7495');
    expect(form.get('gps_unavailable')).toBeNull();
    const proof = VerifyOpenProof.parse(requests.submits[0]);
    expect(proof.gps).toEqual({ lat: 39.7495, lon: -8.8078, accuracy_m: 12 });
    expect(proof.gps_unavailable).toBe(false);
  });
});
