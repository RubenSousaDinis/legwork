import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { AdminPanel } from '../app/admin/AdminPanel';
import { ORIGIN } from '../lib/data/fixtures/live/handlers';

const notFound = vi.fn(() => {
  // The real `notFound()` throws to unwind the render; the mock does the same so the
  // page's control flow is the one that ships.
  throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({ notFound: () => notFound() }));

interface Seen {
  url: string;
  key: string | null;
  body: unknown;
}

const seen: Seen[] = [];

const server = setupServer(
  http.post(`${ORIGIN}/api/admin/:action`, async ({ request }) => {
    seen.push({
      url: request.url,
      key: request.headers.get('X-Admin-Key'),
      body: await request.json().catch(() => null),
    });
    return HttpResponse.json({ ok: true, tx: '0x8f2a4b19c07d5e61c41d' });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());

beforeEach(() => {
  seen.length = 0;
  notFound.mockClear();
  localStorage.clear();
  sessionStorage.clear();
});

const KEY = 'sk-admin-not-a-real-key';

function buttons(root: HTMLElement): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>('.admin-button')];
}

describe('admin', () => {
  it('adminHiddenWithoutFlag', async () => {
    // ---- the flag is unset: the route 404s and no panel is ever in the tree ----
    delete process.env.NEXT_PUBLIC_ADMIN_UI;
    const { default: AdminPage } = await import('../app/admin/page');
    expect(() => AdminPage()).toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalledTimes(1);

    // Anything that is not exactly `'1'` is also a 404.
    process.env.NEXT_PUBLIC_ADMIN_UI = '0';
    expect(() => AdminPage()).toThrow('NEXT_NOT_FOUND');

    // ---- with the flag on, the panel renders behind an empty key --------------
    process.env.NEXT_PUBLIC_ADMIN_UI = '1';
    const { container } = render(AdminPage());
    const key = container.querySelector<HTMLInputElement>('[data-testid="admin-key"]')!;
    expect(key.type).toBe('password');
    expect(key.getAttribute('autocomplete')).toBe('off');

    const all = buttons(container);
    expect(all.map((b) => b.dataset.action)).toEqual([
      'pause',
      'unpause',
      'resolve',
      'reset-demo',
      'reset-worker',
    ]);
    for (const button of all) expect(button.disabled).toBe(true);

    // Typing a key enables them; nothing was sendable before.
    fireEvent.change(key, { target: { value: KEY } });
    for (const button of buttons(container)) expect(button.disabled).toBe(false);

    // ---- `pause` goes straight out, with the key as a header -----------------
    await act(async () => {
      fireEvent.click(buttons(container)[0]!);
    });
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]!.url).toBe(`${ORIGIN}/api/admin/pause`);
    expect(seen[0]!.key).toBe(KEY);

    // ---- `resolve` sends nothing until the second tap -------------------------
    const resolve = () => buttons(container).find((b) => b.dataset.action === 'resolve')!;
    await act(async () => {
      fireEvent.click(resolve());
    });
    expect(seen).toHaveLength(1);
    expect(resolve().textContent).toBe('Confirm');

    await act(async () => {
      fireEvent.click(resolve());
    });
    await waitFor(() => expect(seen).toHaveLength(2));
    expect(seen[1]!.url).toBe(`${ORIGIN}/api/admin/resolve`);
    expect(seen[1]!.body).toEqual({ task_id: '', to_buyer: false });

    // ---- the key is held in memory and nowhere else ---------------------------
    expect(document.body.innerHTML).not.toContain(KEY);
    expect(container.innerHTML).not.toContain(KEY);
    expect(localStorage.getItem('admin-key')).toBeNull();
    expect(JSON.stringify(localStorage)).not.toContain(KEY);
    expect(JSON.stringify(sessionStorage)).not.toContain(KEY);
    expect(document.cookie).not.toContain(KEY);
    expect(window.location.search).not.toContain(KEY);
  });

  it('adminArmsAndDisarmsTheDestructiveActions', () => {
    vi.useFakeTimers();
    process.env.NEXT_PUBLIC_ADMIN_UI = '1';
    const { container } = render(<AdminPanel />);
    fireEvent.change(container.querySelector('[data-testid="admin-key"]')!, {
      target: { value: KEY },
    });

    const resetDemo = () => buttons(container).find((b) => b.dataset.action === 'reset-demo')!;
    fireEvent.click(resetDemo());
    expect(resetDemo().dataset.armed).toBe('true');
    expect(container.textContent).toContain('tap Confirm within 5 seconds');

    // The window closes on its own: a stale arm is not a licence to wipe state.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(resetDemo().dataset.armed).toBe('false');
    expect(resetDemo().textContent).toBe('reset-demo');
    expect(seen).toHaveLength(0);
    vi.useRealTimers();
  });

  it('adminReportsAKeyRejectionInAmberAndSaysTheCallIsLogged', async () => {
    process.env.NEXT_PUBLIC_ADMIN_UI = '1';
    server.use(
      http.post(`${ORIGIN}/api/admin/:action`, () =>
        HttpResponse.json({ error: 'unauthorized' }, { status: 401 }),
      ),
    );
    const { container } = render(<AdminPanel />);
    fireEvent.change(container.querySelector('[data-testid="admin-key"]')!, {
      target: { value: 'wrong' },
    });
    await act(async () => {
      fireEvent.click(buttons(container)[0]!);
    });

    const result = await waitFor(() =>
      container.querySelector('[data-testid="admin-result"]')!,
    );
    expect(result.textContent).toContain('key rejected');
    // Amber, never red: the failure class is the refusal class.
    expect(result.getAttribute('data-ok')).toBe('false');
    expect(container.textContent).toContain('every call is audit-logged by the API');

    // Every control is a 44 px target.
    for (const el of container.querySelectorAll('.admin-button, .admin-input, .admin-toggle')) {
      expect(el.getAttribute('data-hit')).toBe('44');
    }
  });
});
