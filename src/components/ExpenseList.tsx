import { useState } from 'react';
import type { Cents, Expense, ExpenseFields, Month } from '../engine/types';
import { fundingMonth, DEFAULT_PAYDAY } from '../engine/timing';
import { formatDue, formatEuros, formatMonthShort } from '../utils/format';
import { ExpenseForm } from './ExpenseForm';

interface ExpenseListProps {
  envelopes: Expense[];
  /** Each expense's current share of the pot, by id. */
  sharesById: Record<string, Cents>;
  currentMonth: Month;
  /** Day of the month pay arrives. */
  payday: number;
  onAdd: (fields: ExpenseFields) => void;
  onUpdate: (id: string, fields: ExpenseFields) => void;
  onRemove: (id: string) => void;
  onRestore: (envelope: Expense, index: number) => void;
  /** Which form is open: an envelope id, NEW_EXPENSE, or null. One at a time. */
  openForm: string | null;
  onOpenFormChange: (formKey: string | null) => void;
}

/** The openForm value meaning "the add-an-expense form". */
export const NEW_EXPENSE = 'new';

/** Your known future expenses: add, edit in place, delete with undo. */
export function ExpenseList({
  envelopes,
  sharesById,
  currentMonth,
  payday,
  onAdd,
  onUpdate,
  onRemove,
  onRestore,
  openForm,
  onOpenFormChange,
}: ExpenseListProps) {
  const [lastDeleted, setLastDeleted] = useState<{ envelope: Expense; index: number } | null>(null);

  const byDueMonth = [...envelopes].sort(
    (a, b) => a.dueMonth.localeCompare(b.dueMonth) || a.name.localeCompare(b.name),
  );

  function openFormFor(formKey: string): void {
    onOpenFormChange(formKey);
    setLastDeleted(null);
  }

  function handleDelete(envelope: Expense): void {
    // Remember its position in the saved list, so Undo restores it exactly.
    const index = envelopes.findIndex((candidate) => candidate.id === envelope.id);
    onRemove(envelope.id);
    setLastDeleted({ envelope, index });
    onOpenFormChange(null);
  }

  function handleUndo(): void {
    if (lastDeleted === null) return;
    onRestore(lastDeleted.envelope, lastDeleted.index);
    setLastDeleted(null);
  }

  return (
    <section className="expenses" aria-labelledby="expenses-title">
      <h2 id="expenses-title" className="expenses-title">
        Your expenses
      </h2>

      <div className="undo-area" aria-live="polite">
        {lastDeleted !== null && (
          <p className="undo-bar">
            <span>Deleted “{lastDeleted.envelope.name}”</span>
            <button type="button" className="button-text" onClick={handleUndo}>
              Undo
            </button>
          </p>
        )}
      </div>

      {byDueMonth.length === 0 && openForm !== NEW_EXPENSE && (
        <p className="expenses-empty">
          List the one-off expenses you know are coming: a trip, new tyres, a birthday. Rough amounts and
          months are fine; you can refine them later.
        </p>
      )}

      {byDueMonth.length > 0 && (
        <ul className="expense-list">
          {byDueMonth.map((envelope) =>
            openForm === envelope.id ? (
              <li key={envelope.id} className="expense-row expense-row--editing">
                <ExpenseForm
                  initial={envelope}
                  currentMonth={currentMonth}
                  payday={payday}
                  submitLabel="Save changes"
                  onSave={(fields) => {
                    onUpdate(envelope.id, fields);
                    onOpenFormChange(null);
                  }}
                  onCancel={() => onOpenFormChange(null)}
                />
              </li>
            ) : (
              <ExpenseRow
                key={envelope.id}
                envelope={envelope}
                shareCents={sharesById[envelope.id]}
                onEdit={() => openFormFor(envelope.id)}
                onDelete={() => handleDelete(envelope)}
                payday={payday}
              />
            ),
          )}
        </ul>
      )}

      {openForm === NEW_EXPENSE ? (
        <div className="expense-new">
          <ExpenseForm
            currentMonth={currentMonth}
            payday={payday}
            submitLabel="Add expense"
            onSave={(fields) => {
              onAdd(fields);
              onOpenFormChange(null);
            }}
            onCancel={() => onOpenFormChange(null)}
          />
        </div>
      ) : (
        <button type="button" className="button-primary add-button" onClick={() => openFormFor(NEW_EXPENSE)}>
          Add an expense
        </button>
      )}
    </section>
  );
}

interface ExpenseRowProps {
  envelope: Expense;
  /** Its share of the pot; missing once it's paid and settled. */
  shareCents: Cents | undefined;
  payday: number;
  onEdit: () => void;
  onDelete: () => void;
}

function ExpenseRow({ envelope, shareCents, payday, onEdit, onDelete }: ExpenseRowProps) {
  const details = [
    formatEuros(envelope.targetCents),
    `due ${formatDue(envelope)}`,
    ...(payday === DEFAULT_PAYDAY ? [] : [`from your ${formatMonthShort(fundingMonth(envelope, payday))} paycheck`]),
    ...(shareCents === undefined ? [] : [`${formatEuros(shareCents)} of it in the pot`]),
  ];
  if (envelope.paidMonth !== undefined) details.push(`paid ${formatMonthShort(envelope.paidMonth)}`);

  return (
    <li className="expense-row">
      <div className="expense-text">
        <p className="expense-name">{envelope.name}</p>
        <p className="expense-details">{details.join(' · ')}</p>
      </div>
      <div className="expense-actions">
        <button type="button" className="button-text" onClick={onEdit} aria-label={`Edit ${envelope.name}`}>
          Edit
        </button>
        <button
          type="button"
          className="button-text button-text--danger"
          onClick={onDelete}
          aria-label={`Delete ${envelope.name}`}
        >
          Delete
        </button>
      </div>
    </li>
  );
}
