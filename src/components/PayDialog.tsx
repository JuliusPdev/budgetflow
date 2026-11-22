import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { PaymentPreview } from '../engine/paymentPreview';
import { splitPayment, type ExtraFrom, type PaymentSplit } from '../engine/payments';
import { groupChanges } from '../engine/takeOut';
import type { Cents, Day, Expense, Month } from '../engine/types';
import { centsToInputText, parseEurosToCents } from '../utils/expenseDraft';
import { formatEuros } from '../utils/format';
import { whoseMoney } from '../utils/whoseMoney';
import { ExtraQuestion } from './ExtraQuestion';

/** A payment as you confirm it: how it splits, and the expense's new planned amount if it went up. */
export interface PayDetails {
  split: PaymentSplit;
  date: Day;
  /** Set when paying more than planned out of the pot raises the expense to this. */
  targetAfterCents?: Cents;
}

interface PayDialogProps {
  expense: Expense;
  /** Paid towards it so far: from the pot and from spending money. */
  paidCents: Cents;
  /** What's in the pot right now: it can't pay more than that. */
  potCents: Cents;
  today: Day;
  /** What paying like this would change, the same plan as the main screen. */
  previewFor: (details: PayDetails) => PaymentPreview;
  /** How a paycheck is named, e.g. "21 Dec". */
  paycheckLabel: (month: Month) => string;
  /** "paycheck" with a payday set, "month" without. */
  unit: 'paycheck' | 'month';
  onPay: (details: PayDetails, note: string | undefined) => void;
  onClose: () => void;
}

function range(from: string, to: string): string {
  return from === to ? from : `${from} – ${to}`;
}

/**
 * Paying part or all of an expense, in front of the page like "Add an
 * expense". More than planned: you say where the extra came from. More than
 * the pot holds: the pot pays what it has, the rest came from spending money.
 * What it changes is shown while you type; nothing is saved until you confirm.
 */
export function PayDialog({ expense, paidCents, potCents, today, previewFor, paycheckLabel, unit, onPay, onClose }: PayDialogProps) {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [amountText, setAmountText] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [extraFrom, setExtraFrom] = useState<ExtraFrom | null>(null);
  const [errors, setErrors] = useState<{ amount?: string; date?: string; extra?: string }>({});

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null || dialog.open) return;
    dialog.showModal();
    // showModal focuses the first button (Close); start in the amount instead.
    dialog.querySelector('input')?.focus();
  }, []);

  const { name, targetCents } = expense;
  const leftCents = Math.max(0, targetCents - paidCents);
  const amountCents = parseEurosToCents(amountText);
  const isValidDay = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today;
  const isOverPlan = amountCents !== null && amountCents > leftCents;
  const choice: ExtraFrom = extraFrom ?? 'pot';
  const split = amountCents === null || amountCents === 0 ? null : splitPayment(amountCents, leftCents, potCents, choice);
  const details: PayDetails | null =
    split === null
      ? null
      : {
          split,
          date,
          // Paid from the pot, the extra is part of the plan now.
          ...(split.extraCents > 0 && choice === 'pot' ? { targetAfterCents: targetCents + split.extraCents } : {}),
        };
  // Recalculated on every keystroke, only for a payment that could be saved.
  const preview = details !== null && isValidDay && (!isOverPlan || extraFrom !== null) ? previewFor(details) : null;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const found: typeof errors = {};
    if (amountCents === null || amountCents === 0) found.amount = 'Enter an amount like 300 or 299.50';
    if (!isValidDay) found.date = 'Pick the day you paid: today or earlier';
    if (isOverPlan && extraFrom === null) found.extra = 'Choose where the extra came from.';
    setErrors(found);
    const firstProblem = found.amount !== undefined ? 'amount' : found.date !== undefined ? 'date' : found.extra !== undefined ? 'extra-pot' : null;
    if (firstProblem !== null || details === null) {
      if (firstProblem !== null) document.getElementById(`${id}-${firstProblem}`)?.focus();
      return;
    }
    onPay(details, note.trim() === '' ? undefined : note.trim());
    onClose();
  }

  /** The closing sentences of "What it changes": whose money it was, and what's left. */
  function summary(shown: PaymentPreview, paid: PaymentSplit): string {
    const parts: string[] = [];
    parts.push(paid.fromPotCents > 0 ? whoseMoney(shown, name) : 'Nothing comes out of the pot.');
    if (paid.extraCents > 0 && choice === 'pot') {
      parts.push(`${name} is now planned at ${formatEuros(targetCents + paid.extraCents)}.`);
    }
    // Said in the note above already when the pot was short.
    if (paid.fromSpendingCents > 0 && paid.shortCents === 0) parts.push(`${formatEuros(paid.fromSpendingCents)} counts as paid from your spending money.`);
    parts.push(shown.leftAfterCents === 0 ? `${name} is then fully paid.` : `Still to pay afterwards: ${formatEuros(shown.leftAfterCents)}.`);
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
          Pay towards {name}
        </h2>
        <button type="button" className="button-text" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="field-hint">
        {paidCents > 0
          ? `${formatEuros(paidCents)} of ${formatEuros(targetCents)} paid so far · ${formatEuros(leftCents)} still to pay.`
          : `${formatEuros(targetCents)} to pay.`}{' '}
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
              leftCents > 0 && (
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
              )
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

          {isOverPlan && split !== null && (
            <ExtraQuestion
              id={`${id}-extra`}
              extraCents={split.extraCents}
              value={extraFrom}
              onChange={(value) => {
                setExtraFrom(value);
                setErrors((current) => ({ ...current, extra: undefined }));
              }}
              potHint={`${name} is then planned at ${formatEuros(targetCents + split.extraCents)}; your next ${unit}s put the extra back.`}
              spendingHint={`The pot pays only the ${formatEuros(leftCents)} still planned.`}
              error={errors.extra}
            />
          )}
          {split !== null && split.shortCents > 0 && (!isOverPlan || extraFrom !== null) && (
            <p className="field--wide pot-short" role="status">
              The pot holds only {formatEuros(Math.max(0, potCents))}, so it pays that. The other {formatEuros(split.shortCents)} came
              from your spending money.
            </p>
          )}
        </div>

        <PaymentImpact
          preview={preview}
          expenseName={name}
          paycheckLabel={paycheckLabel}
          unit={unit}
          emptyHint={
            isOverPlan && extraFrom === null
              ? 'Choose where the extra came from to see how your pot and plan would change.'
              : undefined
          }
          summary={preview === null || split === null ? undefined : summary(preview, split)}
        />

        <div className="form-actions">
          <button type="submit" className="button-primary">
            {amountCents === null || amountCents === 0
              ? 'Pay'
              : split !== null && split.fromSpendingCents === 0
                ? `Pay ${formatEuros(amountCents)} from the pot`
                : `Pay ${formatEuros(amountCents)}`}
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
  /** Shown before there's anything to preview. */
  emptyHint?: string;
  /** The closing sentences; by default, whose money the payment was and what's left to pay. */
  summary?: string;
}

/** The "What it changes" box: the pot, this paycheck, later paychecks, and whose money it was. */
export function PaymentImpact({
  preview,
  expenseName,
  paycheckLabel,
  unit,
  emptyHint = 'Enter the amount you paid to see how your pot and plan would change.',
  summary,
}: PaymentImpactProps) {
  if (preview === null) {
    return (
      <section className="cost-preview expense-impact" aria-live="polite">
        <p className="cost-title">What it changes</p>
        <p className="field-hint">{emptyHint}</p>
      </section>
    );
  }

  const { potBeforeCents, potAfterCents, openBeforeCents, openAfterCents, laterChanges, leftAfterCents } = preview;

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
        {summary ??
          `${whoseMoney(preview, expenseName)} ${leftAfterCents === 0 ? `${expenseName} is then fully paid.` : `Still to pay afterwards: ${formatEuros(leftAfterCents)}.`}`}
      </p>
    </section>
  );
}
