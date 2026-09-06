import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Receipt } from '../app/task/[id]/Receipt';
import type { TaskReceipt } from '../lib/data/receipt';
import released from '../lib/data/fixtures/live/task-7-released.json';
import mismatch from '../lib/data/fixtures/live/task-7-mismatch.json';
import locked from '../lib/data/fixtures/live/task-8-locked.json';

afterEach(cleanup);

const MATCHES = 'hash matches onchain ✓';
const DOES_NOT_MATCH = 'hash does not match onchain — not verified';

function receipt(task: unknown): TaskReceipt['task'] {
  return task as TaskReceipt['task'];
}

function basescanLinks(root: HTMLElement): HTMLAnchorElement[] {
  return [...root.querySelectorAll<HTMLAnchorElement>('a[href^="https://sepolia.basescan.org/tx/"]')];
}

describe('receipt', () => {
  it('taskReceiptRehashes', () => {
    // ---- a released task whose proof re-hashes -------------------------------
    const ok = render(<Receipt task={receipt(released)} seeded={false} dataMode="live" />);
    const okText = ok.container.textContent ?? '';

    expect(okText.split(MATCHES)).toHaveLength(2); // exactly once
    expect(okText).not.toContain(DOES_NOT_MATCH);
    // The full hash, not an elided one: an elided proof hash is not a proof reference.
    expect(okText).toContain(released.proof.hash);

    // Money on every surface: 3.45 paid, 3.00 to the worker, 0.45 fee on top.
    expect(okText).toContain('3.00');
    expect(okText).toContain('0.45');
    expect(okText).toContain('3.45');
    // No deducted figure anywhere — the banned one cannot be written out here.
    expect(okText).not.toMatch(/\b2\.\d\d\b/);

    // The coordinate is rounded to about 100 m and never carries a fourth decimal.
    expect(okText).toContain('≈ 39.744, −8.807');
    expect(okText).not.toMatch(/-?\d+\.\d{4,}/);

    expect(basescanLinks(ok.container)).toHaveLength(4);
    cleanup();

    // ---- the same task when the re-hash fails --------------------------------
    const bad = render(<Receipt task={receipt(mismatch)} seeded={false} dataMode="live" />);
    const badText = bad.container.textContent ?? '';
    expect(badText).not.toContain(MATCHES);
    expect(badText).toContain(DOES_NOT_MATCH);
    cleanup();

    // ---- a locked task with no proof at all ----------------------------------
    const none = render(<Receipt task={receipt(locked)} seeded={false} dataMode="live" />);
    const noneText = none.container.textContent ?? '';
    expect(noneText).not.toContain(MATCHES);
    expect(noneText).not.toContain(DOES_NOT_MATCH);
    expect(none.container.querySelector('img')).toBeNull();
    expect(basescanLinks(none.container)).toHaveLength(1);
    expect(basescanLinks(none.container)[0]?.href).toContain(locked.tx.post);
  });

  it('receiptNeverRendersTheBuyerTokenAndGatesTheThumbnail', () => {
    // No `proof.url` in the public read: the thumbnail is named as gated, never shown.
    const gated = render(<Receipt task={receipt(released)} seeded dataMode="live" />);
    expect(gated.container.textContent).toContain('thumbnail gated — buyer only');
    expect(gated.container.querySelector('img')).toBeNull();
    // Rule (9): the flag came from the subgraph, so the chip is rendered.
    expect([...gated.container.querySelectorAll('.chip')].map((c) => c.textContent)).toContain(
      'seeded',
    );
    // The token is a server-side header and appears in no attribute of this page.
    expect(gated.container.innerHTML).not.toContain('X-Buyer-Token');
    expect(gated.container.innerHTML).not.toContain('?t=');
    cleanup();

    // With a token the server already resolved, the signed URL renders once, captioned.
    const withUrl = {
      ...released,
      proof: { ...released.proof, url: 'https://bucket.test/p/abc?exp=1&sig=deadbeef' },
    };
    const shown = render(<Receipt task={receipt(withUrl)} seeded={false} dataMode="live" />);
    const img = shown.container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe(withUrl.proof.url);
    expect(shown.container.textContent).toContain('buyer-gated thumbnail · signed URL');
  });

  it('releasedNeverRendersWithoutAProofReferenceBesideIt', () => {
    // Rule (2): strip the proof from a released task and the submit tx stands in.
    const noProof = { ...released, proof: undefined };
    const { container } = render(
      <Receipt task={receipt(noProof)} seeded={null} dataMode="live" />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('RELEASED');
    expect(text).toContain('proof hash onchain ↗');
    expect(text).not.toContain(MATCHES);
    // Rule (9): a flag we could not read is said out loud, never assumed false.
    expect(text).toContain('seeded status unavailable');
  });
});
