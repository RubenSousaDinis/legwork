'use client';

import {
  CALL_CONFIRM_TEMPLATES,
  NOTE_MAX_CHARS,
  type CallTemplateId,
  type TaskType,
} from '@legwork/shared';
import { Button } from '../../components/ui/Button';

/**
 * The answer, by task type — segmented buttons, none preselected.
 *
 * Nothing is chosen for the worker. A preselected `open` is a nudge toward the answer the
 * buyer was hoping for, and the copy one screen up says the opposite: you are paid for the
 * proof, not the answer. So the submit button stays disabled until a human taps something.
 *
 * `call-confirm` is labelled `self-reported answer + timestamp (unverified)` wherever it
 * appears. No webview can read a call log; this screen records what the worker says happened
 * and says so, rather than dressing it up as evidence.
 */

export const SELF_REPORTED_LABEL = 'self-reported answer + timestamp (unverified)';
export const TEMPLATE_PICKER_LABEL = 'Which question did the task ask?';
export const CALLED_LABEL = 'I called';

/** The per-type enums of §2, and of the proof schemas in `packages/shared`. */
export const PHOTO_ANSWERS = {
  'verify-open': ['open', 'closed', 'unclear'],
  'photo-of': ['captured', 'not_found', 'refused_by_staff'],
} as const;

export const VERIFY_OPEN_QUESTION = 'open now?';
export const PHOTO_OF_QUESTION = 'did you get the photo?';
export const COMPARE_TWO_QUESTION = 'which one?';
export const COMPARE_TWO_REASON_LABEL = 'why? (required)';

export const COMPARE_ANSWERS = ['a', 'b', 'neither'] as const;

/** `14:32` on the worker's own clock, from the ISO instant that goes to the API. */
export function clockTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

/** The six templates, in the order `packages/shared` declares them. */
export const TEMPLATE_IDS = Object.keys(CALL_CONFIRM_TEMPLATES) as CallTemplateId[];

/** The picker shows questions and answers in ids, so it needs the way back. */
export const TEMPLATE_QUESTIONS = TEMPLATE_IDS.map((id) => CALL_CONFIRM_TEMPLATES[id].question);
export const TEMPLATE_BY_QUESTION = new Map<string, CallTemplateId>(
  TEMPLATE_IDS.map((id) => [CALL_CONFIRM_TEMPLATES[id].question, id]),
);

/**
 * Everything the worker has answered so far. `answer` is the string the API takes; the rest
 * are the per-type extras the proof schemas ask for beside it.
 */
export type AnswerState = {
  answer: string | null;
  template_id?: CallTemplateId;
  called_at?: string;
  price?: { amount: number; currency: 'EUR' };
  time?: string;
  choice?: 'a' | 'b' | 'neither';
  reason?: string;
};

export const EMPTY_ANSWER: AnswerState = { answer: null };

/**
 * Whether SUBMIT may light up. A `price` answer without a figure and a `time` answer without a
 * clock time both fail `CallConfirmProof`, so they are incomplete here rather than a 400 there.
 */
export function isAnswerComplete(taskType: TaskType, state: AnswerState): boolean {
  if (state.answer === null) return false;
  if (taskType === 'compare-two') {
    return state.reason !== undefined && state.reason.trim().length > 0;
  }
  if (taskType === 'call-confirm') {
    if (state.template_id === undefined || state.called_at === undefined) return false;
    if (state.answer === 'price') return state.price !== undefined && Number.isFinite(state.price.amount);
    if (state.answer === 'time') return state.time !== undefined && /^([01]\d|2[0-3]):[0-5]\d$/.test(state.time);
    return true;
  }
  return true;
}

type SegmentedProps = {
  label: string;
  name: string;
  options: readonly string[];
  value: string | null;
  onSelect: (value: string) => void;
};

/** One row of 44 px buttons, one of them selected. Selection is the ink fill, never a colour. */
function Segmented({ label, name, options, value, onSelect }: SegmentedProps) {
  return (
    <div data-answer={name} style={{ marginBottom: 'var(--s-4)' }}>
      <p className="lw-section-label" style={{ margin: '0 0 var(--s-2)' }}>
        {label}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)' }}>
        {options.map((option) => (
          <button
            aria-pressed={value === option}
            className={`lw-button ${value === option ? 'lw-button--primary' : 'lw-button--ghost'}`}
            data-floor="20"
            data-hit="44"
            data-option={option}
            key={option}
            onClick={() => onSelect(option)}
            type="button"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

export type AnswerToggleProps = {
  taskType: TaskType;
  value: AnswerState;
  onChange: (next: AnswerState) => void;
  /** Injectable clock so a test can pin the moment the worker says they called. */
  now?: () => Date;
};

export function AnswerToggle({ taskType, value, onChange, now = () => new Date() }: AnswerToggleProps) {
  if (taskType === 'call-confirm') {
    return <CallConfirmAnswer now={now} onChange={onChange} value={value} />;
  }

  if (taskType === 'compare-two') {
    return <CompareTwoAnswer onChange={onChange} value={value} />;
  }

  return (
    <Segmented
      label={taskType === 'verify-open' ? VERIFY_OPEN_QUESTION : PHOTO_OF_QUESTION}
      name={taskType}
      onSelect={(answer) => onChange({ answer })}
      options={PHOTO_ANSWERS[taskType]}
      value={value.answer}
    />
  );
}

/**
 * The comparison, as a plain toggle. The side-by-side view of the two images is T-42's screen;
 * what this task owns is the answer and the one line that has to come with it.
 */
function CompareTwoAnswer({ value, onChange }: { value: AnswerState; onChange: (next: AnswerState) => void }) {
  return (
    <>
      <Segmented
        label={COMPARE_TWO_QUESTION}
        name="compare-two"
        onSelect={(choice) =>
          onChange({ ...value, answer: choice, choice: choice as 'a' | 'b' | 'neither' })
        }
        options={COMPARE_ANSWERS}
        value={value.answer}
      />
      <CharacterField
        label={COMPARE_TWO_REASON_LABEL}
        name="reason"
        onChange={(reason) => onChange({ ...value, reason })}
        value={value.reason ?? ''}
      />
    </>
  );
}

/**
 * `I called`, then the question, then the answer.
 *
 * The template picker is the written fallback of §13: nothing the worker's phone can reach
 * carries the task's `template_id`, so the worker names the question they were asked from the
 * closed list of six. It is a picker over rendered questions, never free text — buyer text
 * cannot become the question this way.
 */
function CallConfirmAnswer({
  value,
  onChange,
  now,
}: {
  value: AnswerState;
  onChange: (next: AnswerState) => void;
  now: () => Date;
}) {
  const template = value.template_id === undefined ? null : CALL_CONFIRM_TEMPLATES[value.template_id];

  return (
    <div data-answer="call-confirm" style={{ marginBottom: 'var(--s-4)' }}>
      <p className="lw-section-label" style={{ margin: '0 0 var(--s-2)' }}>
        {SELF_REPORTED_LABEL}
      </p>

      {value.called_at === undefined ? (
        <Button
          variant="ghost"
          onClick={() => onChange({ ...value, called_at: now().toISOString() })}
        >
          {CALLED_LABEL}
        </Button>
      ) : (
        <p data-called-at="true" style={{ fontFamily: 'var(--font-mono)', margin: '0 0 var(--s-4)' }}>
          {`called at ${clockTime(value.called_at)} — the server timestamps the submission`}
        </p>
      )}

      {value.called_at === undefined ? null : (
        <Segmented
          label={TEMPLATE_PICKER_LABEL}
          name="template"
          onSelect={(question) => {
            const id = TEMPLATE_BY_QUESTION.get(question);
            if (id === undefined) return;
            onChange({
              ...value,
              template_id: id,
              // A different question means the previous answer belongs to no enum.
              answer: null,
              price: undefined,
              time: undefined,
            });
          }}
          options={TEMPLATE_QUESTIONS}
          value={value.template_id === undefined ? null : CALL_CONFIRM_TEMPLATES[value.template_id].question}
        />
      )}

      {template === null ? null : (
        <Segmented
          label="their answer"
          name="call-answer"
          onSelect={(answer) => onChange({ ...value, answer, price: undefined, time: undefined })}
          options={template.answers}
          value={value.answer}
        />
      )}

      {value.answer === 'price' ? (
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginBottom: 'var(--s-4)' }}>
          <span className="lw-section-label">amount (EUR)</span>
          <input
            data-hit="44"
            data-input="price"
            inputMode="decimal"
            min="0"
            onChange={(event) => {
              const amount = Number(event.target.value);
              onChange({
                ...value,
                price: Number.isFinite(amount) && event.target.value !== ''
                  ? { amount, currency: 'EUR' }
                  : undefined,
              });
            }}
            step="0.01"
            style={{ font: 'inherit', minHeight: '44px', padding: '0 var(--s-2)', width: '10ch' }}
            type="number"
            value={value.price === undefined ? '' : String(value.price.amount)}
          />
        </label>
      ) : null}

      {value.answer === 'time' ? (
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginBottom: 'var(--s-4)' }}>
          <span className="lw-section-label">closes at (HH:MM)</span>
          <input
            data-hit="44"
            data-input="time"
            onChange={(event) => onChange({ ...value, time: event.target.value })}
            style={{ font: 'inherit', minHeight: '44px', padding: '0 var(--s-2)' }}
            type="time"
            value={value.time ?? ''}
          />
        </label>
      ) : null}
    </div>
  );
}

export type CharacterFieldProps = {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
};

/**
 * A capped text field with the count beside it. The cap is `NOTE_MAX_CHARS` from
 * `packages/shared` at both call sites, so the field cannot outgrow the schema.
 */
export function CharacterField({
  label,
  name,
  value,
  onChange,
  maxLength = NOTE_MAX_CHARS,
}: CharacterFieldProps) {
  return (
    <div style={{ marginBottom: 'var(--s-4)' }}>
      <label style={{ display: 'block' }}>
        <span className="lw-section-label">{label}</span>
        <textarea
          data-field={name}
          data-hit="44"
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          rows={2}
          style={{
            border: '1px solid var(--paper-border-2)',
            borderRadius: 'var(--r-button)',
            display: 'block',
            font: 'inherit',
            marginTop: 'var(--s-2)',
            minHeight: '44px',
            padding: 'var(--s-2)',
            width: '100%',
          }}
          value={value}
        />
      </label>
      <p className="lw-placeholder" data-counter={name} style={{ margin: 'var(--s-1) 0 0' }}>
        {`${value.length} / ${maxLength}`}
      </p>
    </div>
  );
}
