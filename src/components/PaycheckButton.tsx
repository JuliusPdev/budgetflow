import { useId, useState, type FormEvent } from 'react';
import { nextPaycheckMonth, paychecksIn, type CurrentPeriod } from '../engine/paychecks';
import type { Cents, Day, LogEntry, Month, PaycheckEntry } from '../engine/types';
import { parseEurosToCents } from '../utils/expenseDraft';
import { formatDayShort, formatMonthLong } from '../utils/format';

interface PaycheckButtonProps {
  period: CurrentPeriod;
  log: LogEntry[];
  payday: number;
  today: Day;
  onLog: (details: Omit<PaycheckEntry, 'id' | 'kind'>) => string;
  onUndo: (entryId: string) => void;
}

const DAY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** "I got my paycheck": starts the next paycheck on the day your pay really arrived. */
export function PaycheckButton({ period, log, payday, today, onLog, onUndo }: PaycheckButtonProps) {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [amountText, setAmountText] = useState('');
  const [errors, setErrors] = useState<{ date?: string; amount?: string }>({});
  const [lastLogged, setLastLogged] = useState<{ id: string; month: Month; date: Day } | null>(null);

  const recorded = paychecksIn(log);
  const lastRecorded = recorded.length === 0 ? undefined : recorded[recorded.length - 1];
  // Which paycheck the button records — named on the button, so a second tap by mistake is obvious.
  const nextMonth = nextPaycheckMonth(log, DAY_PATTERN.test(date) ? date : today, payday);
  const monthName = formatMonthLong(nextMonth).split(' ')[0];

  function open(): void {
    setDate(today);
    setAmountText('');
    setErrors({});
    setLastLogged(null);
    setIsOpen(true);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const found: typeof errors = {};
    if (!DAY_PATTERN.test(date)) found.date = 'Pick the day it arrived';
    else if (date > today) found.date = "It can't have arrived in the future";
    else if (lastRecorded !== undefined && date <= lastRecorded.date) {
      found.date = `Your last paycheck arrived on ${formatDayShort(lastRecorded.date)}; pick a later day`;
    }
    const amountCents: Cents | null = amountText.trim() === '' ? null : parseEurosToCents(amountText);
    if (amountText.trim() !== '' && amountCents === null) found.amount = 'Enter an amount like 2400, or leave it empty';
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const entryId = onLog({ date, month: nextMonth, ...(amountCents === null ? {} : { amountCents }) });
    setLastLogged({ id: entryId, month: nextMonth, date });
    setIsOpen(false);
  }

  const showUndo = lastLogged !== null && log.some((entry) => entry.id === lastLogged.id);

  return (
    <div className={period.nextIsDue && !isOpen ? 'paycheck paycheck--due' : 'paycheck'}>
      <div aria-live="polite">
        {showUndo && (
          <p className="undo-bar">
            <span>
              {formatMonthLong(lastLogged.month).split(' ')[0]} paycheck logged for {formatDayShort(lastLogged.date)}.
              Your new paycheck starts then.
            </span>
            <button
              type="button"
              className="button-text"
              onClick={() => {
                onUndo(lastLogged.id);
                setLastLogged(null);
              }}
            >
              Undo
            </button>
          </p>
        )}
      </div>

      {isOpen ? (
        <form className="paycheck-form" onSubmit={handleSubmit} noValidate aria-labelledby={`${id}-title`}>
          <p id={`${id}-title`} className="paycheck-title">
            Your {monthName} paycheck
          </p>
          <div className="paycheck-fields">
            <div className="field">
              <label htmlFor={`${id}-date`}>When did it arrive?</label>
              <input
                id={`${id}-date`}
                type="date"
                value={date}
                max={today}
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
            <div className="field">
              <label htmlFor={`${id}-amount`}>How much? (€, optional)</label>
              <input
                id={`${id}-amount`}
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={amountText}
                aria-invalid={errors.amount !== undefined}
                aria-describedby={`${id}-amount-hint`}
                onChange={(event) => {
                  setAmountText(event.target.value);
                  setErrors((current) => ({ ...current, amount: undefined }));
                }}
              />
              <div id={`${id}-amount-hint`}>
                {errors.amount !== undefined ? (
                  <p className="field-error" role="alert">
                    {errors.amount}
                  </p>
                ) : (
                  <p className="field-hint">Kept for later, for seeing your free budget. Not used yet.</p>
                )}
              </div>
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="button-primary">
              Start new period
            </button>
            <button type="button" className="button-secondary" onClick={() => setIsOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="paycheck-row">
          <p className="field-hint">
            {period.nextIsDue
              ? `Your ${monthName} paycheck was expected on ${formatDayShort(period.nextExpected)}. Got it?`
              : period.startIsReal
                ? `Paycheck arrived ${formatDayShort(period.start)} · next expected ${formatDayShort(period.nextExpected)}`
                : `Next paycheck expected ${formatDayShort(period.nextExpected)}`}
          </p>
          <button type="button" className={period.nextIsDue ? 'button-primary' : 'button-secondary'} onClick={open}>
            I got my {monthName} paycheck
          </button>
        </div>
      )}
    </div>
  );
}
