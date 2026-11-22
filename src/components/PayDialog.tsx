import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { PaymentPreview } from '../engine/paymentPreview';
import { groupChanges } from '../engine/takeOut';
import type { Cents, Day, Expense, Month } from '../engine/types';
import { centsToInputText, parseEurosToCents } from '../utils/expenseDraft';
import { formatEuros } from '../utils/format';

interface PayDialogProps {
  expense: Expense;
  /** Paid towards it so far. */
  paidCents: Cents;
  today: Day;
  /** What paying this much on this day would change, the same plan as the main screen. */
  previewFor: (amountCents: Cents, date: Day) => PaymentPreview;
  /** How a paycheck is named, e.g. "21 Dec". */
  paycheckLabel: (month: Month) => string;
  /** "paycheck" with a payday set, "month" without. */
  unit: 'paycheck' | 'month';
  onPay: (amountCents: Cents, date: Day, note: string | undefined) => void;
  onClose: () => void;
}

function range(from: string, to: string): string {
  return from === to ? from : `${from} – ${to}`;
}

/**
 * Paying part or all of an expense out of the pot, in front of the page like
 * "Add an expense". What it changes is shown while you type; nothing is saved
 * until you confirm.
 */
export function PayDialog({ expense, paidCents, today, previewFor, paycheckLabel, unit, onPay, onClose }: PayDialogProps) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [amountText, setAmountText] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({});

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null || dialog.open) return;
    dialog.showModal();
    // showModal focuses the first button (Close); start in the amount instead.
    dialog.querySelector('input')?.focus();
  }, []);

  const leftCents = Math.max(0, expense.targetCents - paidCents);
  const amountCents = parseEurosToCents(amountText);
  const isValidDay = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today;
  // Recalculated on every keystroke, only for an amount that could be paid.
  const preview =
    amountCents !== null && amountCents > 0 && amountCents <= leftCents && isValidDay ? previewFor(amountCents, date) : null;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const found: typeof errors = {};
    if (amountCents === null || amountCents === 0) found.amount = 'Enter an amount like 300 or 299.50';
    else if (amountCents > leftCents) found.amount = `That's more than the ${formatEuros(leftCents)} still to pay.`;
    if (!isValidDay) found.date = 'Pick the day you paid: today or earlier';
    setErrors(found);
    if (found.amount !== undefined || found.date !== undefined || amountCents === null) {
      document.getElementById(found.amount !== undefined ? `${id}-amount` : `${id}-date`)?.focus();
      return;
    }
    onPay(amountCents, date, note.trim() === '' ? undefined : note.trim());
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="expense-dialog"
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        // Esc: we close it ourselves, so React's state and the dialog agree.
        event.preventDefault();
        onClose();
      }}
    >
      <div className="expense-dialog-head">
        <h2 id={`${id}-title`} className="expense-dialog-title">
          Pay towards {expense.name}
        </h2>
        <button type="button" className="button-text" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="field-hint">
        {paidCents > 0
          ? `${formatEuros(paidCents)} of ${formatEuros(expense.targetCents)} paid so far · ${formatEuros(leftCents)} still to pay.`
          : `${formatEuros(expense.targetCents)} to pay.`}{' '}
        The money comes out of your pot.
      </p>

      <form className="pay-form" onSubmit={handleSubmit} noValidate>
        <div className="pay-fields">
          <div className="field">
            <label htmlFor={`${id}-amount`}>Amount (€)</label>
            <input
              id={`${id}-amount`}
              type="text"
              inputMode="decimal"
              placeholder={centsToInputText(leftCents)}
              value={amountText}
              aria-invalid={errors.amount !== undefined}
              aria-describedby={errors.amount !== undefined ? `${id}-amount-error` : `${id}-all`}
              onChange={(event) => {
                setAmountText(event.target.value);
                setErrors((current) => ({ ...current, amount: undefined }));
              }}
            />
            {errors.amount !== undefined ? (
              <p id={`${id}-amount-error`} className="field-error" role="alert">
                {errors.amount}
              </p>
            ) : (
              <button
                id={`${id}-all`}
                type="button"
                className="button-text pay-all"
                onClick={() => {
                  setAmountText(centsToInputText(leftCents));
                  setErrors((current) => ({ ...current, amount: undefined }));
                }}
              >
                Pay all {formatEuros(leftCents)}
              </button>
            )}
          </div>
          <div className="field">
            <label htmlFor={`${id}-date`}>Paid on</label>
            <input
              id={`${id}-date`}
              type="date"
              max={today}
              value={date}
              aria-invalid={errors.date !== undefined}
              aria-describedby={errors.date !== undefined ? `${id}-date-error` : undefined}
              onChange={(event) => {
                setDate(event.target.value);
                setErrors((current) => ({ ...current, date: undefined }));
              }}
            />
            {errors.date !== undefined && (
              <p id={`${id}-date-error`} className="field-error" role="alert">
                {errors.date}
              </p>
            )}
          </div>
          <div className="field field--wide">
            <label htmlFor={`${id}-note`}>What for (optional)</label>
            <input
              id={`${id}-note`}
              type="text"
              placeholder="e.g. Accommodation"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>

        <PaymentImpact preview={preview} expenseName={expense.name} paycheckLabel={paycheckLabel} unit={unit} />

        <div className="form-actions">
          <button type="submit" className="button-primary">
            {amountCents !== null && amountCents > 0 ? `Pay ${formatEuros(amountCents)} from the pot` : 'Pay from the pot'}
          </button>
          <button type="button" className="button-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}

interface PaymentImpactProps {
  preview: PaymentPreview | null;
  expenseName: string;
  paycheckLabel: (month: Month) => string;
  unit: 'paycheck' | 'month';
}

/** The "What it changes" box: the pot, this paycheck, later paychecks, and whose money it was. */
function PaymentImpact({ preview, expenseName, paycheckLabel, unit }: PaymentImpactProps) {
  if (preview === null) {
    return (
      <section className="cost-preview expense-impact" aria-live="polite">
        <p className="cost-title">What it changes</p>
        <p className="field-hint">Enter the amount you paid to see how your pot and plan would change.</p>
      </section>
    );
  }

  const { potBeforeCents, potAfterCents, openBeforeCents, openAfterCents, laterChanges, ownMoneyCents, borrowedCents, leftAfterCents } =
    preview;

  return (
    <section className="cost-preview expense-impact" aria-live="polite">
      <p className="cost-title">What it changes</p>
      <p className="cost-row">
        <span>Your pot</span>
        <span className="figures">
          <span className="cost-before">{formatEuros(potBeforeCents)}</span>
          {' → '}
          <strong>{formatEuros(potAfterCents)}</strong>
        </span>
      </p>
      <p className="cost-row">
        <span>Still to put aside this {unit}</span>
        <span className="figures">
          {openBeforeCents === openAfterCents ? (
            <>{formatEuros(openAfterCents)} · no change</>
          ) : (
            <>
              <span className="cost-before">{formatEuros(openBeforeCents)}</span>
              {' → '}
              <strong>{formatEuros(openAfterCents)}</strong>
            </>
          )}
        </span>
      </p>
      {laterChanges.length > 0 && (
        <>
          <p className="cost-label">Later {unit}s:</p>
          <ul className="cost-list">
            {groupChanges(laterChanges).map((run) => (
              <li key={run.from} className="cost-row">
                <span>{range(paycheckLabel(run.from), paycheckLabel(run.to))}</span>
                <span className="figures">
                  <span className="cost-before">{formatEuros(run.beforeCents)}</span>
                  {' → '}
                  <strong>{formatEuros(run.afterCents)}</strong>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="cost-notes">
        {borrowedCents === 0
          ? `All of it was already put aside for ${expenseName}.`
          : ownMoneyCents === 0
            ? `None of it was put aside for ${expenseName} yet: all ${formatEuros(borrowedCents)} is borrowed from your other expenses, and your plan puts it back before they're due.`
            : `${formatEuros(ownMoneyCents)} of it was put aside for ${expenseName}. The other ${formatEuros(borrowedCents)} is borrowed from your other expenses, and your plan puts it back before they're due.`}{' '}
        {leftAfterCents === 0 ? `${expenseName} is then fully paid.` : `Still to pay afterwards: ${formatEuros(leftAfterCents)}.`}
      </p>
    </section>
  );
}
