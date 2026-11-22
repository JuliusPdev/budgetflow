import { useId, useState, type FormEvent } from 'react';
import type { Day, Expense } from '../engine/types';
import { formatDue } from '../utils/format';

interface OverdueNotesProps {
  /** Expenses whose date has passed and that aren't done, longest overdue first. */
  overdue: Expense[];
  today: Day;
  /** Opens the Done window for an expense. */
  onDone: (id: string) => void;
  /** Gives an expense a new due date (or month, for month-only ones). */
  onMove: (id: string, due: { dueMonth: string; dueDate?: string }) => void;
}

/**
 * "Gifts was due 20 Dec. Is it over?" — one note per overdue expense, in the
 * top card. Until you answer, the plan keeps its money.
 */
export function OverdueNotes({ overdue, today, onDone, onMove }: OverdueNotesProps) {
  const id = useId();
  // Which note has its "Move date" field open, and what's typed in it.
  const [moving, setMoving] = useState<{ expenseId: string; value: string; error: string | null } | null>(null);

  if (overdue.length === 0) return null;
  const thisMonth = today.slice(0, 7);

  function save(event: FormEvent<HTMLFormElement>, expense: Expense): void {
    event.preventDefault();
    if (moving === null) return;
    const { value } = moving;
    if (expense.dueDate !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < today) {
        setMoving({ ...moving, error: 'Pick a day from today on.' });
        return;
      }
      onMove(expense.id, { dueMonth: value.slice(0, 7), dueDate: value });
    } else {
      if (!/^\d{4}-\d{2}$/.test(value) || value < thisMonth) {
        setMoving({ ...moving, error: 'Pick this month or a later one.' });
        return;
      }
      onMove(expense.id, { dueMonth: value });
    }
    setMoving(null);
  }

  return (
    <div className="overdue-notes" aria-live="polite">
      {overdue.map((expense) => {
        const isMoving = moving?.expenseId === expense.id;
        const fieldId = `${id}-${expense.id}`;
        const hasDay = expense.dueDate !== undefined;
        return (
          <section key={expense.id} className="overdue-note" aria-label={`${expense.name} is overdue`}>
            <p className="overdue-text">
              <strong>{expense.name}</strong> was due {formatDue(expense)}. Is it over? Until you say, your plan keeps its money.
            </p>
            {isMoving ? (
              <form className="overdue-move" onSubmit={(event) => save(event, expense)} noValidate>
                <label htmlFor={fieldId}>{hasDay ? 'New due date' : 'New due month'}</label>
                <input
                  id={fieldId}
                  type={hasDay ? 'date' : 'month'}
                  min={hasDay ? today : thisMonth}
                  autoFocus
                  value={moving.value}
                  aria-invalid={moving.error !== null}
                  aria-describedby={moving.error !== null ? `${fieldId}-error` : undefined}
                  onChange={(event) => setMoving({ ...moving, value: event.target.value, error: null })}
                />
                <button type="submit" className="button-text">
                  Save
                </button>
                <button type="button" className="button-text" onClick={() => setMoving(null)}>
                  Cancel
                </button>
                {moving.error !== null && (
                  <p id={`${fieldId}-error`} className="field-error" role="alert">
                    {moving.error}
                  </p>
                )}
              </form>
            ) : (
              <div className="overdue-actions">
                <button type="button" className="button-secondary" onClick={() => onDone(expense.id)}>
                  Done…
                </button>
                <button
                  type="button"
                  className="button-text"
                  onClick={() => setMoving({ expenseId: expense.id, value: '', error: null })}
                >
                  Move date
                </button>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
