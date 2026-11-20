import { useEffect, useId, useRef } from 'react';
import type { ExpensePreview } from '../engine/expensePreview';
import type { ExpenseFields, Month } from '../engine/types';
import { ExpenseForm } from './ExpenseForm';

interface AddExpenseDialogProps {
  currentMonth: Month;
  payday: number;
  previewFor: (fields: ExpenseFields) => ExpensePreview;
  paycheckLabel: (month: Month) => string;
  onAdd: (fields: ExpenseFields) => void;
  onClose: () => void;
}

/**
 * Adding an expense in front of the page, from wherever you are. The browser's
 * own <dialog> keeps the keyboard inside it and closes it with Esc. Clicking
 * beside it doesn't close it, so a half-filled form isn't lost by accident.
 */
export function AddExpenseDialog({ currentMonth, payday, previewFor, paycheckLabel, onAdd, onClose }: AddExpenseDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null || dialog.open) return;
    dialog.showModal();
    // showModal focuses the first button (Close); start in the name field instead.
    dialog.querySelector('input')?.focus();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="expense-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Esc: we close it ourselves, so React's state and the dialog agree.
        event.preventDefault();
        onClose();
      }}
    >
      <div className="expense-dialog-head">
        <h2 id={titleId} className="expense-dialog-title">
          Add an expense
        </h2>
        <button type="button" className="button-text" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="field-hint">You'll see what it changes in your plan before anything is saved.</p>
      <ExpenseForm
        currentMonth={currentMonth}
        payday={payday}
        submitLabel="Add expense"
        previewFor={previewFor}
        paycheckLabel={paycheckLabel}
        onSave={(fields) => {
          onAdd(fields);
          onClose();
        }}
        onCancel={onClose}
      />
    </dialog>
  );
}
