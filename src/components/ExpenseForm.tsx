import { useId, useState, type FormEvent } from 'react';
import { DEFAULT_PAYDAY, fundingMonth, paycheckDates } from '../engine/timing';
import type { ExpensePreview } from '../engine/expensePreview';
import type { ExpenseFields, Month } from '../engine/types';
import { formatDayShort } from '../utils/format';
import {
  DRAFT_FIELD_ORDER,
  draftFrom,
  validateDraft,
  type Draft,
  type DraftErrors,
  type DraftField,
} from '../utils/expenseDraft';
import { ExpenseImpact } from './ExpenseImpact';

interface ExpenseFormProps {
  /** The expense being edited; leave out to add a new one. */
  initial?: ExpenseFields;
  /** Day of the month pay arrives, to show which paycheck covers the expense. */
  payday: number;
  submitLabel: string;
  onSave: (fields: ExpenseFields) => void;
  onCancel: () => void;
  /** What saving these fields would change; shown live while you type. */
  previewFor?: (fields: ExpenseFields) => ExpensePreview;
  /** How a paycheck is named in the preview, e.g. "21 Dec". */
  paycheckLabel?: (month: Month) => string;
}

/** Add or edit one expense. Nothing is saved until the draft passes its checks. */
export function ExpenseForm({
  initial,
  payday,
  submitLabel,
  onSave,
  onCancel,
  previewFor,
  paycheckLabel,
}: ExpenseFormProps) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(initial));
  const [errors, setErrors] = useState<DraftErrors>({});
  const formId = useId();

  function fieldId(field: DraftField): string {
    return `${formId}-${field}`;
  }

  function setField<Field extends DraftField>(field: Field, value: Draft[Field]): void {
    setDraft((current) => ({ ...current, [field]: value }));
    // Editing a field clears its message; the next save checks again.
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  // Checked quietly on every keystroke: once the draft is complete, the preview
  // shows what it would change. Messages only appear when you press save.
  const complete = validateDraft(draft);
  const preview = previewFor !== undefined && complete.ok ? previewFor(complete.fields) : null;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const result = validateDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      const firstProblem = DRAFT_FIELD_ORDER.find((field) => result.errors[field] !== undefined);
      // Found by its id when you submit, so the cursor can jump to the first problem.
      if (firstProblem !== undefined) document.getElementById(fieldId(firstProblem))?.focus();
      return;
    }
    onSave(result.fields);
  }

  /** Shared wiring for a text-like input: id and error state. */
  function inputProps(field: DraftField) {
    return {
      id: fieldId(field),
      'aria-invalid': errors[field] !== undefined,
      'aria-describedby': errors[field] !== undefined ? `${fieldId(field)}-error` : undefined,
    };
  }

  /** The day of the last paycheck that puts money toward this, once the timing is filled in. */
  function coveringPaycheck(): string | null {
    const isMonth = draft.dueMode === 'month' && /^\d{4}-\d{2}$/.test(draft.dueMonth);
    const isDay = draft.dueMode === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(draft.dueDate);
    if (!isMonth && !isDay) return null;
    const timing = isDay
      ? { dueMonth: draft.dueDate.slice(0, 7), dueDate: draft.dueDate }
      : { dueMonth: draft.dueMonth };
    return formatDayShort(paycheckDates(fundingMonth({ id: '', name: '', targetCents: 0, ...timing }, payday), payday).last);
  }

  function errorFor(field: DraftField) {
    const message = errors[field];
    return message === undefined ? null : (
      <p id={`${fieldId(field)}-error`} className="field-error">
        {message}
      </p>
    );
  }

  return (
    <form className="expense-form" onSubmit={handleSubmit} noValidate>
      <div className="field field--wide">
        <label htmlFor={fieldId('name')}>Name</label>
        <input
          {...inputProps('name')}
          type="text"
          autoComplete="off"
          placeholder="Flights to Lisbon"
          value={draft.name}
          onChange={(event) => setField('name', event.target.value)}
          autoFocus
        />
        {errorFor('name')}
      </div>

      <div className="field">
        <label htmlFor={fieldId('amount')}>Amount (€)</label>
        <input
          {...inputProps('amount')}
          type="text"
          inputMode="decimal"
          placeholder="900"
          value={draft.amount}
          onChange={(event) => setField('amount', event.target.value)}
        />
        {errorFor('amount')}
      </div>

      <fieldset className="field field--wide due-field">
        <legend>When is it due?</legend>
        <div className="choice-toggle">
          {(['month', 'date'] as const).map((mode) => (
            <label key={mode} className="choice">
              <input
                type="radio"
                name={fieldId('dueMode')}
                checked={draft.dueMode === mode}
                onChange={() => setField('dueMode', mode)}
              />
              <span>{mode === 'month' ? 'Month' : 'Exact date'}</span>
            </label>
          ))}
        </div>
        {draft.dueMode === 'month' ? (
          <>
            <input
              {...inputProps('dueMonth')}
              aria-label="Due month"
              type="month"
              placeholder="2027-01"
              value={draft.dueMonth}
              onChange={(event) => setField('dueMonth', event.target.value)}
            />
            <p className="field-hint">Counts as needed when the month starts. Not sure of the week? Pick its first day.</p>
            {errorFor('dueMonth')}
          </>
        ) : (
          <>
            <input
              {...inputProps('dueDate')}
              aria-label="Due date"
              type="date"
              placeholder="2027-01-28"
              value={draft.dueDate}
              onChange={(event) => setField('dueDate', event.target.value)}
            />
            {errorFor('dueDate')}
          </>
        )}
        {payday !== DEFAULT_PAYDAY && coveringPaycheck() !== null && (
          <p className="field-hint due-paycheck">Last set-aside on {coveringPaycheck()}</p>
        )}
      </fieldset>

      {previewFor !== undefined && paycheckLabel !== undefined && (
        <div className="field--wide">
          <ExpenseImpact
            preview={preview}
            paycheckLabel={paycheckLabel}
            unit={payday === DEFAULT_PAYDAY ? 'month' : 'paycheck'}
          />
        </div>
      )}

      <div className="form-actions field--wide">
        <button type="submit" className="button-primary">
          {submitLabel}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
