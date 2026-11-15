import { useId, useRef, useState, type FormEvent } from 'react';
import type { EnvelopeFields, Month } from '../engine/types';
import {
  DRAFT_FIELD_ORDER,
  draftFrom,
  validateDraft,
  type Draft,
  type DraftErrors,
  type DraftField,
} from '../utils/expenseDraft';

interface ExpenseFormProps {
  /** The expense being edited; leave out to add a new one. */
  initial?: EnvelopeFields;
  currentMonth: Month;
  submitLabel: string;
  onSave: (fields: EnvelopeFields) => void;
  onCancel: () => void;
}

/** Add or edit one expense. Nothing is saved until the draft passes its checks. */
export function ExpenseForm({ initial, currentMonth, submitLabel, onSave, onCancel }: ExpenseFormProps) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(initial, currentMonth));
  const [errors, setErrors] = useState<DraftErrors>({});
  const formId = useId();
  // Bookmarks to the input boxes, so the cursor can jump to the first problem.
  const inputRefs = useRef<Partial<Record<DraftField, HTMLInputElement | null>>>({});

  function fieldId(field: DraftField): string {
    return `${formId}-${field}`;
  }

  function setField<Field extends DraftField>(field: Field, value: Draft[Field]): void {
    setDraft((current) => ({ ...current, [field]: value }));
    // Editing a field clears its message; the next save checks again.
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const result = validateDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      const firstProblem = DRAFT_FIELD_ORDER.find((field) => result.errors[field] !== undefined);
      if (firstProblem !== undefined) inputRefs.current[firstProblem]?.focus();
      return;
    }
    onSave(result.fields);
  }

  /** Shared wiring for a text-like input: id, error state, and its bookmark. */
  function inputProps(field: DraftField) {
    return {
      id: fieldId(field),
      'aria-invalid': errors[field] !== undefined,
      'aria-describedby': errors[field] !== undefined ? `${fieldId(field)}-error` : undefined,
      ref: (element: HTMLInputElement | null) => {
        inputRefs.current[field] = element;
      },
    };
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

      <div className="field">
        <label htmlFor={fieldId('dueMonth')}>Due month</label>
        <input
          {...inputProps('dueMonth')}
          type="month"
          placeholder="2027-01"
          value={draft.dueMonth}
          onChange={(event) => setField('dueMonth', event.target.value)}
        />
        {errorFor('dueMonth')}
      </div>

      <div className="field">
        <label htmlFor={fieldId('saved')}>Already saved (€)</label>
        <input
          {...inputProps('saved')}
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={draft.saved}
          onChange={(event) => setField('saved', event.target.value)}
        />
        <p className="field-hint">Money you've already put aside for this</p>
        {errorFor('saved')}
      </div>

      <div className="field field--wide">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.isPaid}
            onChange={(event) => setField('isPaid', event.target.checked)}
          />
          <span>Already paid</span>
        </label>
        <p className="field-hint">
          Paid before it was fully saved? The gap counts as a loan from your savings, repaid by the due month.
        </p>
      </div>

      {draft.isPaid && (
        <div className="field">
          <label htmlFor={fieldId('paidMonth')}>Paid in</label>
          <input
            {...inputProps('paidMonth')}
            type="month"
            placeholder="2026-11"
            value={draft.paidMonth}
            onChange={(event) => setField('paidMonth', event.target.value)}
          />
          {errorFor('paidMonth')}
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
