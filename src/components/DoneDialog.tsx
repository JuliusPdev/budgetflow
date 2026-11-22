import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { PaymentPreview } from '../engine/paymentPreview';
import { finishSplit, type ExtraFrom } from '../engine/payments';
import type { Cents, Day, Expense, Month } from '../engine/types';
import { centsToInputText, parseEurosToCents } from '../utils/expenseDraft';
import { formatEuros } from '../utils/format';
import { whoseMoney } from '../utils/whoseMoney';
import { ExtraQuestion } from './ExtraQuestion';
import { PaymentImpact } from './PayDialog';

interface DoneDialogProps {
  expense: Expense;
  /** Paid towards it so far: from the pot and from spending money. */
  paidCents: Cents;
  /** What's in the pot right now: the last payment can't take more than that. */
  potCents: Cents;
  today: Day;
  /** What finishing it like this would change, the same plan as the main screen. */
  previewFor: (costCents: Cents, date: Day, extraFrom: ExtraFrom) => PaymentPreview;
  /** How a paycheck is named, e.g. "21 Dec". */
  paycheckLabel: (month: Month) => string;
  /** "paycheck" with a payday set, "month" without. */
  unit: 'paycheck' | 'month';
  onDone: (costCents: Cents, date: Day, extraFrom: ExtraFrom) => void;
  onClose: () => void;
}

/**
 * Finishing an expense with what it really cost. Cheaper: the rest stays in the
 * pot. More expensive: you say where the extra came from. Nothing is saved
 * until you confirm.
 */
export function DoneDialog({ expense, paidCents, potCents, today, previewFor, paycheckLabel, unit, onDone, onClose }: DoneDialogProps) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [costText, setCostText] = useState('');
  const [date, setDate] = useState(today);
  const [extraFrom, setExtraFrom] = useState<ExtraFrom | null>(null);
  const [errors, setErrors] = useState<{ cost?: string; date?: string; extra?: string }>({});

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null || dialog.open) return;
    dialog.showModal();
    // showModal focuses the first button (Close); start in the total instead.
    dialog.querySelector('input')?.focus();
  }, []);

  const { targetCents, name } = expense;
  // "0" is a real answer here: it was cancelled and cost nothing.
  const costCents = costText.trim() === '' ? null : parseEurosToCents(costText);
  const isValidDay = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today;
  // Only extra money not paid yet needs an answer: what Pay already settled doesn't.
  const settledCents = Math.max(targetCents, paidCents);
  const isDearer = costCents !== null && costCents > settledCents;
  const extraCents = isDearer ? costCents - settledCents : 0;
  const canPreview = costCents !== null && costCents >= paidCents && isValidDay && (!isDearer || extraFrom !== null);
  // Recalculated on every keystroke, only for an answer that could be saved.
  const choice: ExtraFrom = extraFrom ?? 'pot';
  const preview = canPreview ? previewFor(costCents, date, choice) : null;
  const last = costCents === null ? null : finishSplit(targetCents, paidCents, costCents, choice, potCents);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const found: typeof errors = {};
    if (costCents === null) found.cost = 'Enter what it cost in total, like 750 or 749.50. Enter 0 if it was cancelled.';
    else if (costCents < paidCents) found.cost = `You've already paid ${formatEuros(paidCents)} towards it, so the total is at least that.`;
    if (!isValidDay) found.date = 'Pick the day it was over: today or earlier';
    if (isDearer && extraFrom === null) found.extra = 'Choose where the extra came from.';
    setErrors(found);
    const firstProblem = found.cost !== undefined ? 'cost' : found.date !== undefined ? 'date' : found.extra !== undefined ? 'extra-pot' : null;
    if (firstProblem !== null || costCents === null) {
      if (firstProblem !== null) document.getElementById(`${id}-${firstProblem}`)?.focus();
      return;
    }
    onDone(costCents, date, choice);
    onClose();
  }

  /** The closing sentences of "What it changes", in the words of this choice. */
  function summary(shown: PaymentPreview): string {
    const parts: string[] = [];
    const fromPot = last?.fromPotCents ?? 0;
    if (fromPot > 0) parts.push(`The pot pays the last ${formatEuros(fromPot)}. ${whoseMoney(shown, name)}`);
    else parts.push('Nothing more leaves the pot.');
    if (last !== null && last.fromSpendingCents > 0) {
      parts.push(`The pot holds only ${formatEuros(Math.max(0, potCents))}: the other ${formatEuros(last.fromSpendingCents)} came from your spending money.`);
    }
    if (costCents === 0 && paidCents === 0) {
      parts.push(`Nothing was spent: everything put aside for ${name} is free for your other expenses.`);
    } else if (costCents !== null && costCents < targetCents) {
      const lessCents = formatEuros(targetCents - costCents);
      parts.push(`It cost ${lessCents} less than planned, so your plan no longer asks for that ${lessCents}.`);
    } else if (isDearer && choice === 'spending') {
      parts.push(`The extra ${formatEuros(extraCents)} came from your spending money, so the pot pays only up to the planned ${formatEuros(targetCents)}.`);
    } else if (isDearer) {
      parts.push(`The extra ${formatEuros(extraCents)} comes from the pot too, and your plan puts it back.`);
    }
    return parts.join(' ');
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
          {name} is done
        </h2>
        <button type="button" className="button-text" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="field-hint">
        Planned {formatEuros(targetCents)}
        {paidCents > 0 ? ` · ${formatEuros(paidCents)} paid so far` : ''}. Your plan stops putting money aside for it.
      </p>

      <form className="pay-form" onSubmit={handleSubmit} noValidate>
        <div className="pay-fields">
          <div className="field">
            <label htmlFor={`${id}-cost`}>What did it cost in total? (€)</label>
            <input
              id={`${id}-cost`}
              type="text"
              inputMode="decimal"
              placeholder={centsToInputText(targetCents)}
              value={costText}
              aria-invalid={errors.cost !== undefined}
              aria-describedby={errors.cost !== undefined ? `${id}-cost-error` : `${id}-planned`}
              onChange={(event) => {
                setCostText(event.target.value);
                setErrors((current) => ({ ...current, cost: undefined }));
              }}
            />
            {errors.cost !== undefined ? (
              <p id={`${id}-cost-error`} className="field-error" role="alert">
                {errors.cost}
              </p>
            ) : (
              <button
                id={`${id}-planned`}
                type="button"
                className="button-text pay-all"
                onClick={() => {
                  setCostText(centsToInputText(targetCents));
                  setErrors((current) => ({ ...current, cost: undefined }));
                }}
              >
                As planned: {formatEuros(targetCents)}
              </button>
            )}
          </div>
          <div className="field">
            <label htmlFor={`${id}-date`}>Finished on</label>
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

          {isDearer && (
            <ExtraQuestion
              id={`${id}-extra`}
              extraCents={extraCents}
              value={extraFrom}
              onChange={(value) => {
                setExtraFrom(value);
                setErrors((current) => ({ ...current, extra: undefined }));
              }}
              potHint={`It all comes out of the pot; your next ${unit}s put the extra back.`}
              spendingHint="The pot pays only the planned amount; your plan stays as it is."
              error={errors.extra}
            />
          )}
        </div>

        <PaymentImpact
          preview={preview}
          expenseName={name}
          paycheckLabel={paycheckLabel}
          unit={unit}
          emptyHint={
            isDearer && extraFrom === null
              ? 'Choose where the extra came from to see how your pot and plan would change.'
              : 'Enter what it cost to see how your pot and plan would change.'
          }
          summary={preview === null ? undefined : summary(preview)}
        />

        <div className="form-actions">
          <button type="submit" className="button-primary">
            Mark as done
          </button>
          <button type="button" className="button-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
