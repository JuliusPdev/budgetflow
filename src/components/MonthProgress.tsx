import { useId, useState, type FormEvent } from 'react';
import type { MonthPlan } from '../engine/plan';
import { setAsideInMonth, stillOpenThisMonth } from '../engine/savingsLog';
import type { Cents, Day, LogEntry, SetAsideEntry } from '../engine/types';
import { centsToInputText, parseEurosToCents } from '../utils/expenseDraft';
import { formatEuros } from '../utils/format';

interface MonthProgressProps {
  /** This month's plan, calculated from where things stood at the start of the month. */
  monthPlan: MonthPlan;
  log: LogEntry[];
  today: Day;
  /** How to name this period in sentences: a month ("November") or "this savings phase". */
  periodName: string;
  onLog: (details: Omit<SetAsideEntry, 'id' | 'kind'>) => string;
  onUndo: (entryId: string) => void;
}

/** How much of this month's plan you've actually set aside, and a way to log more. */
export function MonthProgress({ monthPlan, log, today, periodName, onLog, onUndo }: MonthProgressProps) {
  const loggedCents = setAsideInMonth(log, monthPlan.month);
  const openCents = stillOpenThisMonth(monthPlan, log);

  // Only what you typed is remembered. Until you type, the field follows what's
  // still open, so it stays right when the plan changes.
  const [typedText, setTypedText] = useState<string | null>(null);
  const amountText = typedText ?? (openCents > 0 ? centsToInputText(openCents) : '');
  const [error, setError] = useState<string | null>(null);
  const [lastLogged, setLastLogged] = useState<{ id: string; amountCents: Cents; extraCents: Cents } | null>(
    null,
  );
  const fieldId = useId();

  const amountCents = parseEurosToCents(amountText);
  // More than this period needs isn't wasted: it stays in the pot and lowers what comes next.
  const extraCents = amountCents !== null ? Math.max(0, amountCents - openCents) : 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (amountCents === null || amountCents === 0) {
      setError('Enter an amount like 240 or 239.50');
      return;
    }
    const id = onLog({ date: today, month: monthPlan.month, amountCents });
    setLastLogged({ id, amountCents, extraCents });
    setTypedText(null);
    setError(null);
  }

  function handleUndo(): void {
    if (lastLogged === null) return;
    onUndo(lastLogged.id);
    setTypedText(null);
    setLastLogged(null);
  }

  const progress = monthPlan.totalCents === 0 ? 1 : Math.min(1, loggedCents / monthPlan.totalCents);
  const isDone = loggedCents >= monthPlan.totalCents;

  return (
    <div className="month-progress">
      <p className="progress-line">
        <span>Set aside so far</span>
        <span className="figures">
          {formatEuros(loggedCents)} of {formatEuros(monthPlan.totalCents)}
        </span>
      </p>
      <div
        className="goal-bar progress-bar"
        role="progressbar"
        aria-label={`Set aside in ${periodName}`}
        aria-valuemin={0}
        aria-valuemax={monthPlan.totalCents / 100}
        aria-valuenow={Math.min(loggedCents, monthPlan.totalCents) / 100}
        aria-valuetext={`${formatEuros(loggedCents)} of ${formatEuros(monthPlan.totalCents)}`}
      >
        <span className="goal-bar-fill" style={{ width: `${progress * 100}%` }} />
      </div>
      {isDone && <p className="progress-done sync-dot">Done for {periodName}</p>}

      <form className="log-form" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor={`${fieldId}-amount`}>Amount you moved to savings (€)</label>
          <div className="log-row">
            <input
              id={`${fieldId}-amount`}
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={amountText}
              aria-invalid={error !== null}
              aria-describedby={`${fieldId}-hint`}
              onChange={(event) => {
                setTypedText(event.target.value);
                setError(null);
              }}
            />
            <button type="submit" className="button-primary">
              Log set-aside
            </button>
          </div>
          <div id={`${fieldId}-hint`}>
            {error !== null && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            {extraCents > 0 && (
              <p className="field-hint">
                {formatEuros(extraCents)} more than this period needs. It stays in the pot and lowers your next
                set-asides.
              </p>
            )}
          </div>
        </div>
      </form>

      <div aria-live="polite">
        {lastLogged !== null && log.some((entry) => entry.id === lastLogged.id) && (
          <p className="undo-bar">
            <span>
              Logged {formatEuros(lastLogged.amountCents)} for {periodName}.
              {lastLogged.extraCents > 0 &&
                ` ${formatEuros(lastLogged.extraCents)} of it lowers your next set-asides.`}
            </span>
            <button type="button" className="button-text" onClick={handleUndo}>
              Undo
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
