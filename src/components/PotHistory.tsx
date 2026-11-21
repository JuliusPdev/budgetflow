import { useId, useState, type FormEvent } from 'react';
import type { Cents, LogEntry } from '../engine/types';
import { STARTING_BALANCE_ID } from '../storage/envelopeStore';
import { centsToInputText, parseEurosToCents } from '../utils/expenseDraft';
import { formatDayShort, formatEuros, formatMonthShort } from '../utils/format';

interface PotHistoryProps {
  log: LogEntry[];
  onChangeAmount: (entryId: string, amountCents: Cents) => void;
  onDelete: (entryId: string) => void;
}

/** "−100" or "-100" → −10000 cents. Corrections can take money away, so a minus is allowed for them. */
function parseSignedEuros(text: string): Cents | null {
  const trimmed = text.trim();
  const isNegative = trimmed.startsWith('-') || trimmed.startsWith('−');
  const cents = parseEurosToCents(isNegative ? trimmed.slice(1) : trimmed);
  return cents === null ? null : isNegative ? -cents : cents;
}

function signed(cents: Cents): string {
  return `${cents < 0 ? '−' : '+'}${formatEuros(Math.abs(cents))}`;
}

function titleOf(entry: LogEntry): string {
  if (entry.kind === 'set-aside') return 'Set aside';
  if (entry.kind === 'withdrawal') return `Took out · ${entry.reason}`;
  if (entry.kind === 'paycheck') return `Paycheck arrived · ${formatMonthShort(entry.month)}`;
  return entry.note ?? 'Correction';
}

/** Pot movements can be fixed in place; a paycheck is deleted and logged again instead. */
type MoneyEntry = Exclude<LogEntry, { kind: 'paycheck' }>;

/** What an entry did to the pot: a withdrawal is stored as a positive amount but takes money out. */
function potEffect(entry: MoneyEntry): Cents {
  return entry.kind === 'withdrawal' ? -entry.amountCents : entry.amountCents;
}

/** Set-asides and withdrawals are amounts above zero; only corrections can be negative. */
function isPositiveOnly(entry: MoneyEntry): boolean {
  return entry.kind !== 'adjustment';
}

/** Every movement of money in the pot, newest first, each fixable or removable. */
export function PotHistory({ log, onChangeAmount, onDelete }: PotHistoryProps) {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState<{ entryId: string; text: string; error: string | null } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  // Newest first. Entries without a date (the starting balance) are the oldest.
  // On the same day, the later entry first: entries are stored in the order you made them.
  const newestFirst = log
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (b.entry.date ?? '').localeCompare(a.entry.date ?? '') || b.index - a.index)
    .map(({ entry }) => entry);

  function save(event: FormEvent<HTMLFormElement>, entry: MoneyEntry): void {
    event.preventDefault();
    if (editing === null) return;
    const cents = parseSignedEuros(editing.text);
    if (cents === null || (isPositiveOnly(entry) && cents <= 0)) {
      setEditing({
        ...editing,
        error: isPositiveOnly(entry) ? 'Enter an amount like 200 or 199.50' : 'Enter an amount like 100 or −100',
      });
      return;
    }
    onChangeAmount(entry.id, cents);
    setEditing(null);
  }

  if (log.length === 0) return null;

  return (
    <div className="pot-history">
      <button
        type="button"
        className="button-text pot-correct"
        aria-expanded={isOpen}
        aria-controls={`${id}-list`}
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? 'Hide history' : `Show history (${log.length})`}
      </button>

      {isOpen && (
        <ul id={`${id}-list`} className="log-history">
          {newestFirst.map((entry) => {
            const title = titleOf(entry);
            const when = entry.date === undefined ? 'When BudgetFlow switched to one pot' : formatDayShort(entry.date);
            const isEditing = editing?.entryId === entry.id;

            return (
              <li key={entry.id} className="expense-row log-entry">
                <div className="expense-text">
                  <p className="expense-name">{title}</p>
                  <p className="expense-details">{when}</p>
                </div>

                {entry.kind === 'paycheck' ? (
                  // Not money in the pot, so no plus or minus.
                  <span className="figures log-amount log-amount--neutral">
                    {entry.amountCents === undefined ? 'no amount' : formatEuros(entry.amountCents)}
                  </span>
                ) : isEditing ? (
                  <form className="log-edit" onSubmit={(event) => save(event, entry)} noValidate>
                    <label className="sr-only" htmlFor={`${id}-${entry.id}`}>
                      New amount for {title} (€)
                    </label>
                    <input
                      id={`${id}-${entry.id}`}
                      type="text"
                      inputMode={isPositiveOnly(entry) ? 'decimal' : 'text'}
                      autoFocus
                      value={editing.text}
                      aria-invalid={editing.error !== null}
                      aria-describedby={editing.error !== null ? `${id}-${entry.id}-error` : undefined}
                      onChange={(event) => setEditing({ ...editing, text: event.target.value, error: null })}
                    />
                    <button type="submit" className="button-text">
                      Save
                    </button>
                    <button type="button" className="button-text" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                    {editing.error !== null && (
                      <p id={`${id}-${entry.id}-error`} className="field-error" role="alert">
                        {editing.error}
                      </p>
                    )}
                  </form>
                ) : (
                  <span className={`figures log-amount ${potEffect(entry) < 0 ? 'log-amount--out' : 'log-amount--in'}`}>
                    {signed(potEffect(entry))}
                  </span>
                )}

                {confirming === entry.id ? (
                  <div className="log-confirm" role="group" aria-label="Confirm delete">
                    <span className="field-hint">
                      {entry.kind === 'paycheck'
                        ? 'Delete? You go back to the paycheck before.'
                        : entry.id === STARTING_BALANCE_ID
                          ? `Delete? This takes your starting balance of ${formatEuros(entry.amountCents)} out of the pot.`
                          : 'Delete? The pot and your plan are recalculated without it.'}
                    </span>
                    <button
                      type="button"
                      className="button-text button-text--danger"
                      onClick={() => {
                        onDelete(entry.id);
                        setConfirming(null);
                      }}
                    >
                      Delete
                    </button>
                    <button type="button" className="button-text" onClick={() => setConfirming(null)}>
                      Keep
                    </button>
                  </div>
                ) : (
                  !isEditing && (
                    <div className="expense-actions">
                      {entry.kind !== 'paycheck' && (
                      <button
                        type="button"
                        className="button-text"
                        aria-label={`Edit ${title}${entry.date === undefined ? '' : ` on ${formatDayShort(entry.date)}`}`}
                        onClick={() => {
                          setConfirming(null);
                          setEditing({
                            entryId: entry.id,
                            // A withdrawal is edited as the amount taken out, without a minus.
                            text: `${entry.amountCents < 0 ? '−' : ''}${centsToInputText(Math.abs(entry.amountCents))}`,
                            error: null,
                          });
                        }}
                      >
                        Edit
                      </button>
                      )}
                      <button
                        type="button"
                        className="button-text button-text--danger"
                        aria-label={`Delete ${title}${entry.date === undefined ? '' : ` on ${formatDayShort(entry.date)}`}`}
                        onClick={() => {
                          setEditing(null);
                          setConfirming(entry.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
