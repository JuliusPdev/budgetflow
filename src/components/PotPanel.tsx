import { useId, useState, type FormEvent, type ReactNode } from 'react';
import type { PotShares } from '../engine/pot';
import type { Cents, LogEntry } from '../engine/types';
import { centsToInputText, parseEurosToCents } from '../utils/expenseDraft';
import { formatEuros } from '../utils/format';
import { PotHistory } from './PotHistory';

interface PotPanelProps {
  potCents: Cents;
  potShares: PotShares;
  /** True while the pot covers the closest deadlines first instead of following the plan. */
  closestFirst: boolean;
  log: LogEntry[];
  /** Makes the pot match what you say is really there. Returns the new entry's id, or null if nothing changed. */
  onCorrect: (actualCents: Cents) => string | null;
  onUndo: (entryId: string) => void;
  onChangeAmount: (entryId: string, amountCents: Cents) => void;
  onDelete: (entryId: string) => void;
  /** Taking money out, shown with the pot's other actions. */
  children?: ReactNode;
}

/** What's in your pot, what it's meant for, and a way to correct it. */
export function PotPanel({ potCents, potShares, closestFirst, log, onCorrect, onUndo, onChangeAmount, onDelete, children }: PotPanelProps) {
  const id = useId();
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastCorrection, setLastCorrection] = useState<{ id: string; differenceCents: Cents } | null>(null);

  const forExpensesCents = Object.values(potShares.shares).reduce((sum, cents) => sum + cents, 0);

  function startCorrecting(): void {
    setAmountText(centsToInputText(Math.max(0, potCents)));
    setError(null);
    setLastCorrection(null);
    setIsCorrecting(true);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const actualCents = parseEurosToCents(amountText);
    if (actualCents === null) {
      setError('Enter an amount like 530 or 529.50');
      return;
    }
    const entryId = onCorrect(actualCents);
    if (entryId !== null) setLastCorrection({ id: entryId, differenceCents: actualCents - potCents });
    setIsCorrecting(false);
  }

  return (
    <section className="pot" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="section-label">
        Your pot
      </h2>
      <p className="pot-line">
        <span>In your pot</span>
        <span className="figures pot-amount">{formatEuros(potCents)}</span>
      </p>
      {potShares.shortfallCents > 0 ? (
        <p className="pot-warning">
          More went out than came in: {formatEuros(potShares.shortfallCents)} to put back first. It's in this
          period's plan.
        </p>
      ) : (
        <p className="field-hint">
          {formatEuros(forExpensesCents)} meant for your expenses, {closestFirst ? 'closest deadline first' : 'shared the way your plan splits each paycheck'}
          {potShares.extraCents > 0 && ` · ${formatEuros(potShares.extraCents)} extra, not needed yet`}.
        </p>
      )}

      <div aria-live="polite">
        {lastCorrection !== null && log.some((entry) => entry.id === lastCorrection.id) && (
          <p className="undo-bar">
            <span>
              Pot corrected by {lastCorrection.differenceCents > 0 ? '+' : '−'}
              {formatEuros(Math.abs(lastCorrection.differenceCents))}.
            </span>
            <button
              type="button"
              className="button-text"
              onClick={() => {
                onUndo(lastCorrection.id);
                setLastCorrection(null);
              }}
            >
              Undo
            </button>
          </p>
        )}
      </div>

      {isCorrecting ? (
        <form className="pot-form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor={`${id}-amount`}>How much is really in your pot? (€)</label>
            <div className="log-row">
              <input
                id={`${id}-amount`}
                type="text"
                inputMode="decimal"
                autoFocus
                value={amountText}
                aria-invalid={error !== null}
                aria-describedby={`${id}-hint`}
                onChange={(event) => {
                  setAmountText(event.target.value);
                  setError(null);
                }}
              />
              <button type="submit" className="button-primary">
                Save
              </button>
              <button type="button" className="button-secondary" onClick={() => setIsCorrecting(false)}>
                Cancel
              </button>
            </div>
            <div id={`${id}-hint`}>
              {error !== null ? (
                <p className="field-error" role="alert">
                  {error}
                </p>
              ) : (
                <p className="field-hint">
                  Check where you keep the pot's money. BudgetFlow records the difference as a correction and shares the
                  pot out again.
                </p>
              )}
            </div>
          </div>
        </form>
      ) : (
        <button type="button" className="button-text pot-correct" onClick={startCorrecting}>
          Correct the balance
        </button>
      )}

      {children}

      <PotHistory log={log} onChangeAmount={onChangeAmount} onDelete={onDelete} />
    </section>
  );
}
