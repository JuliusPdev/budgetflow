import { useId, useState, type FormEvent } from 'react';
import type { Cents, LogEntry } from '../engine/types';
import { STARTING_BALANCE_ID } from '../storage/envelopeStore';
import { centsToInputText, parseEurosToCents } from '../utils/expenseDraft';
import { formatDayShort, formatEuros } from '../utils/format';

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
  return entry.kind === 'set-aside' ? 'Set aside' : (entry.note ?? 'Correction');
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

  function save(event: FormEvent<HTMLFormElement>, entry: LogEntry): void {
    event.preventDefault();
    if (editing === null) return;
    const cents = parseSignedEuros(editing.text);
    if (cents === null || (entry.kind === 'set-aside' && cents <= 0)) {
      setEditing({
        ...editing,
        error: entry.kind === 'set-aside' ? 'Enter an amount like 200 or 199.50' : 'Enter an amount like 100 or −100',
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

                {isEditing ? (
                  <form className="log-edit" onSubmit={(event) => save(event, entry)} noValidate>
                    <label className="sr-only" htmlFor={`${id}-${entry.id}`}>
                      New amount for {title} (€)
                    </label>
                    <input
                      id={`${id}-${entry.id}`}
                      type="text"
                      inputMode={entry.kind === 'set-aside' ? 'decimal' : 'text'}
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
                  <span className={`figures log-amount ${entry.amountCents < 0 ? 'log-amount--out' : 'log-amount--in'}`}>
                    {signed(entry.amountCents)}
                  </span>
                )}

                {confirming === entry.id ? (
                  <div className="log-confirm" role="group" aria-label="Confirm delete">
                    <span className="field-hint">
                      {entry.id === STARTING_BALANCE_ID
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
                      <button
                        type="button"
                        className="button-text"
                        aria-label={`Edit ${title}${entry.date === undefined ? '' : ` on ${formatDayShort(entry.date)}`}`}
                        onClick={() => {
                          setConfirming(null);
                          setEditing({
                            entryId: entry.id,
                            text: `${entry.amountCents < 0 ? '−' : ''}${centsToInputText(Math.abs(entry.amountCents))}`,
                            error: null,
                          });
                        }}
                      >
                        Edit
                      </button>
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
