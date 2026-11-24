import { useId, useState, type FormEvent } from 'react';
import { daysBetween } from '../engine/months';
import { nextPaycheckMonth, paychecksIn, type CurrentPeriod } from '../engine/paychecks';
import type { Cents, Day, LogEntry, Month, PaycheckEntry } from '../engine/types';
import { parseEurosToCents } from '../utils/expenseDraft';
import { formatDayShort, formatMonthLong, formatWeekdayShort } from '../utils/format';
import { ModalDialog } from './ModalDialog';

interface PaycheckStripProps {
  period: CurrentPeriod;
  log: LogEntry[];
  payday: number;
  today: Day;
  /** The current paycheck's dates, e.g. "24 Nov – 23 Dec", or "24 Nov – today" while the next is late. */
  paycheckLabel: string;
  onLog: (details: Omit<PaycheckEntry, 'id' | 'kind'>) => string;
  onUndo: (entryId: string) => void;
}

const DAY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** "today", "yesterday", "3 days ago". */
function sinceText(days: number): string {
  if (days <= 0) return 'today';
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/**
 * The top of the card: today, the paycheck you're in and how far along it is.
 * Logging a paycheck is only offered once it's expected; before that, the
 * paycheck's dates open the same window, for pay that comes early.
 */
export function PaycheckStrip({ period, log, payday, today, paycheckLabel, onLog, onUndo }: PaycheckStripProps) {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [amountText, setAmountText] = useState('');
  const [errors, setErrors] = useState<{ date?: string; amount?: string }>({});
  const [lastLogged, setLastLogged] = useState<{ id: string; month: Month; date: Day } | null>(null);

  const recorded = paychecksIn(log);
  const lastRecorded = recorded.length === 0 ? undefined : recorded[recorded.length - 1];
  // Which paycheck this records: named in the window, so a second log by mistake is obvious.
  const nextMonth = nextPaycheckMonth(log, DAY_PATTERN.test(date) ? date : today, payday);
  const monthName = formatMonthLong(nextMonth).split(' ')[0];
  const expectedName = formatMonthLong(nextPaycheckMonth(log, today, payday)).split(' ')[0];

  // How far along the paycheck you are; full once the next one is expected.
  const lengthDays = Math.max(1, daysBetween(period.start, period.nextExpected));
  const dayOf = Math.min(lengthDays, Math.max(1, daysBetween(period.start, today) + 1));
  const share = period.nextIsDue ? 1 : Math.min(1, daysBetween(period.start, today) / lengthDays);

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
    <div className="paycheck-strip">
      <div className="strip-row">
        <span className="strip-today">{formatWeekdayShort(today)}</span>
        <button type="button" className="strip-dates" onClick={open}>
          Paycheck {paycheckLabel}
          <span className="sr-only">: log a paycheck</span>
          <span aria-hidden="true"> ›</span>
        </button>
      </div>
      <div
        className="strip-bar"
        role="img"
        aria-label={period.nextIsDue ? 'The next paycheck is due' : `Day ${dayOf} of ${lengthDays} in this paycheck`}
      >
        <span className="strip-bar-fill" style={{ width: `${share * 100}%` }} />
      </div>
      {period.nextIsDue ? (
        <div className="strip-row strip-due">
          <span>
            {expectedName} paycheck expected {sinceText(period.daysLate ?? 0)}
          </span>
          <button type="button" className="strip-log" onClick={open}>
            Log paycheck
          </button>
        </div>
      ) : (
        <p className="strip-row strip-ends">
          <span>
            {period.startIsReal ? 'Arrived' : 'Payday'} {formatDayShort(period.start)}
          </span>
          <span>Next expected {formatDayShort(period.nextExpected)}</span>
        </p>
      )}

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

      {isOpen && (
        <ModalDialog title={`Your ${monthName} paycheck`} onClose={() => setIsOpen(false)}>
          <form className="dialog-form" onSubmit={handleSubmit} noValidate>
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
            <div className="form-actions">
              <button type="submit" className="button-primary">
                Start new paycheck
              </button>
              <button type="button" className="button-secondary" onClick={() => setIsOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        </ModalDialog>
      )}
    </div>
  );
}
