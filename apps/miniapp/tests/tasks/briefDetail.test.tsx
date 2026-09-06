import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TaskRow } from '../../components/TaskCard';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push }) }));

const { TASKS_TWO_ROWS } = await import('../../mocks/handlers');
const { TaskCard } = await import('../../components/TaskCard');

/**
 * `call-confirm` and `compare-two` have no row in T-24's fixtures, so the wire shape comes
 * from the fixture's own `photo-of` row and the fields are the ones `WorkerBrief` declares.
 */
const BASE: TaskRow = {
  task_id: '2048',
  task_type: 'call-confirm',
  title: 'Óptica Leiria · Rua Direita 8, Leiria',
  price_usdc: 3.0,
  distance_m: 320,
  state: 'open',
  seeded: false,
};

function renderCard(row: TaskRow) {
  return render(
    <TaskCard
      expanded
      onClaim={() => {}}
      onRelease={() => {}}
      onToggle={() => {}}
      row={row}
    />,
  );
}

afterEach(cleanup);

describe('the brief under the question', () => {
  it('briefDetailRendersPerType', () => {
    // --- `photo-of`, straight off T-24's fixture: the subject is what to photograph.
    const seeded = TASKS_TWO_ROWS.tasks[1] as TaskRow;
    expect(seeded.task_type).toBe('photo-of');
    renderCard(seeded);
    expect(screen.getByText('Photograph the subject named in the title')).toBeTruthy();
    expect(document.querySelector('[data-brief="subject"]')?.textContent).toBe(
      'the opening-hours sign at the main entrance',
    );
    cleanup();

    // --- `subject_detail` joins the subject on the same line when the row carries it.
    renderCard({
      ...seeded,
      brief: { ...seeded.brief, subject_detail: 'the printed one, not the handwritten note' },
    });
    expect(document.querySelector('[data-brief="subject"]')?.textContent).toBe(
      'the opening-hours sign at the main entrance — the printed one, not the handwritten note',
    );
    cleanup();

    // --- `call-confirm`: the question to read down the phone.
    renderCard({
      ...BASE,
      brief: { template_question: 'Are you open on Sunday morning?' },
    });
    expect(screen.getByText('Call and ask the template question shown after you claim')).toBeTruthy();
    expect(document.querySelector('[data-brief="template_question"]')?.textContent).toBe(
      'Are you open on Sunday morning?',
    );
    cleanup();

    // --- `compare-two`: the criterion, as a mono tag.
    renderCard({
      ...BASE,
      task_type: 'compare-two',
      brief: { criterion_id: 'cheaper_per_litre' },
    });
    const criterion = document.querySelector('[data-brief="criterion_id"]');
    expect(criterion?.querySelector('.lw-monotag')?.textContent).toBe('cheaper_per_litre');
  });

  it('briefDetailAbsentRendersAsBefore', () => {
    // The `verify-open` fixture row: a brief with a place and a question and nothing to add.
    const real = TASKS_TWO_ROWS.tasks[0] as TaskRow;
    renderCard(real);
    expect(screen.getByText('Is it open right now?')).toBeTruthy();
    expect(document.querySelector('[data-brief]')).toBeNull();
    cleanup();

    // A row with no `brief` at all — every type falls back to the type-derived copy alone.
    for (const task_type of ['verify-open', 'photo-of', 'call-confirm', 'compare-two'] as const) {
      renderCard({ ...BASE, task_type, brief: undefined });
      expect(document.querySelector('[data-brief]'), task_type).toBeNull();
      cleanup();
    }

    // …and so does a `brief` that carries only the fields this card does not render.
    renderCard({ ...BASE, task_type: 'photo-of', brief: { place: undefined, phone: '+351 244 000 000' } });
    expect(document.querySelector('[data-brief]')).toBeNull();
  });
});
