import { useId, useState, type FormEvent } from 'react';
import { groupChanges, type TakeOutPreview } from '../engine/takeOut';
import type { Cents, LogEntry, Month } from '../engine/types';
import { parseEurosToCents } from '../utils/expenseDraft';
import { formatEuros } from '../utils/format';

interface TakeOutProps {
  /** What taking this much out would cost — the same plan as the main screen. */
  previewFor: (amountCents: Cents) => TakeOutPreview;
  /** "paycheck" with a payday set, "month" without. */
  unit: 'paycheck' | 'month';
  /** How each period is named on the screen, e.g. "Dec 2026". */
  periodLabel: (month: Month) => string;
  log: LogEntry[];
  onTakeOut: (amountCents: Cents, reason: string) => string;
  onUndo: (entryId: string) => void;
}

/** Taking money out of the pot, with what it would cost shown before you decide. */
export function TakeOut({ previewFor, unit, periodLabel, log, onTakeOut, onUndo }: TakeOutProps) {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; reason?: string }>({});
  const [lastTaken, setLastTaken] = useState<{ id: string; amountCents: Cents; reason: string } | null>(null);

  // Recalculated on every keystroke; nothing is saved until you confirm.
  const amountCents = parseEurosToCents(amountText);
  const preview = amountCents !== null && amountCents > 0 ? previewFor(amountCents) : null;

  function close(): void {
    setIsOpen(false);
    setAmountText('');
    setReason('');
    setErrors({});
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const found: typeof errors = {};
    if (amountCents === null || amountCents === 0) found.amount = 'Enter an amount like 100 or 99.50';
    if (reason.trim() === '') found.reason = 'Say what it was for, so you recognise it later';
    setErrors(found);
    if (amountCents === null || amountCents === 0 || found.reason !== undefined) return;
    const entryId = onTakeOut(amountCents, reason.trim());
    setLastTaken({ id: entryId, amountCents, reason: reason.trim() });
    close();
  }

  const showUndo = lastTaken !== null && log.some((entry) => entry.id === lastTaken.id);

  return (
    <div className="take-out">
      <div aria-live="polite">
        {showUndo && (
          <p className="undo-bar">
            <span>
              Took out {formatEuros(lastTaken.amountCents)} for {lastTaken.reason}.
            </span>
            <button
              type="button"
              className="button-text"
              onClick={() => {
                onUndo(lastTaken.id);
                setLastTaken(null);
              }}
            >
              Undo
            </button>
          </p>
        )}
      </div>

      {!isOpen ? (
        <button
          type="button"
          className="button-text pot-correct"
          onClick={() => {
            setIsOpen(true);
            setLastTaken(null);
          }}
        >
          Take money out
        </button>
      ) : (
        <form className="take-out-form" onSubmit={handleSubmit} noValidate aria-labelledby={`${id}-title`}>
          <p id={`${id}-title`} className="take-out-title">
            Take money out
          </p>
          <p className="field-hint">You'll see what it costs before anything changes.</p>

          <div className="take-out-fields">
            <div className="field">
              <label htmlFor={`${id}-amount`}>Amount (€)</label>
              <input
                id={`${id}-amount`}
                type="text"
                inputMode="decimal"
                placeholder="0"
                autoFocus
                value={amountText}
                aria-invalid={errors.amount !== undefined}
                aria-describedby={errors.amount !== undefined ? `${id}-amount-error` : undefined}
                onChange={(event) => {
                  setAmountText(event.target.value);
                  setErrors((current) => ({ ...current, amount: undefined }));
                }}
              />
              {errors.amount !== undefined && (
                <p id={`${id}-amount-error`} className="field-error" role="alert">
                  {errors.amount}
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor={`${id}-reason`}>What for</label>
              <input
                id={`${id}-reason`}
                type="text"
                placeholder="e.g. Concert"
                value={reason}
                aria-invalid={errors.reason !== undefined}
                aria-describedby={errors.reason !== undefined ? `${id}-reason-error` : undefined}
                onChange={(event) => {
                  setReason(event.target.value);
                  setErrors((current) => ({ ...current, reason: undefined }));
                }}
              />
              {errors.reason !== undefined && (
                <p id={`${id}-reason-error`} className="field-error" role="alert">
                  {errors.reason}
                </p>
              )}
            </div>
          </div>

          <section className="cost-preview" aria-live="polite" aria-labelledby={`${id}-cost`}>
            <p id={`${id}-cost`} className="cost-title">
              What it costs you
            </p>
            {preview === null ? (
              <p className="field-hint">Enter an amount to see how your set-asides would change.</p>
            ) : preview.openAfterCents === preview.openBeforeCents ? (
              <p className="cost-notes">
                It comes out of your {formatEuros(preview.extraCents)} extra, money no expense needs yet. Your
                plan doesn't change.
              </p>
            ) : (
              <>
                <p className="cost-row">
                  <span>Still to put aside this {unit === 'paycheck' ? 'paycheck' : 'month'}</span>
                  <span className="figures">
                    <span className="cost-before">{formatEuros(preview.openBeforeCents)}</span>
                    {' → '}
                    <strong>{formatEuros(preview.openAfterCents)}</strong>
                  </span>
                </p>
                <ul className="cost-notes">
                  {preview.fromExtraCents > 0 && (
                    <li>{formatEuros(preview.fromExtraCents)} comes out of your extra, so only the rest is missing.</li>
                  )}
                  <li>Put it back before your next {unit} and nothing else changes.</li>
                </ul>
                {preview.laterChanges.length > 0 && (
                  <>
                    <p className="cost-label">If you can't, set aside per {unit} after that:</p>
                    <ul className="cost-list">
                      {groupChanges(preview.laterChanges).map((run) => (
                        <li key={run.from} className="cost-row">
                          <span>
                            {run.from === run.to ? periodLabel(run.from) : `${periodLabel(run.from)} – ${periodLabel(run.to)}`}
                          </span>
                          <span className="figures">
                            <span className="cost-before">{formatEuros(run.beforeCents)}</span>
                            {' → '}
                            <strong>{formatEuros(run.afterCents)}</strong>
                          </span>
                        </li>
                      ))}
                    </ul>
                    {preview.backToNormal !== null && (
                      <p className="cost-notes">
                        From {periodLabel(preview.backToNormal.month)}: back to {formatEuros(preview.backToNormal.cents)}.
                      </p>
                    )}
                  </>
                )}
              </>
            )}
            {amountCents !== null && amountCents > Math.max(0, preview?.potCents ?? 0) && (
              <p className="cost-warning">
                Only {formatEuros(Math.max(0, preview?.potCents ?? 0))} is in your pot. The rest would have to come
                from somewhere else.
              </p>
            )}
          </section>

          <div className="form-actions">
            <button type="submit" className="button-primary">
              Take it out
            </button>
            <button type="button" className="button-secondary" onClick={close}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
