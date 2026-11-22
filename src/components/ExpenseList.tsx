import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { ExpensePreview } from '../engine/expensePreview';
import type { FillUpView } from '../engine/fillUp';
import type { ExpenseProgress } from '../engine/payments';
import type { Cents, Expense, ExpenseFields, Month } from '../engine/types';
import { fundingMonth, DEFAULT_PAYDAY, paycheckDates } from '../engine/timing';
import { formatDayShort, formatDue, formatEuros } from '../utils/format';
import { ExpenseForm } from './ExpenseForm';
import { FillUpAxis, FillUpBar } from './FillUpBar';

interface ExpenseListProps {
  envelopes: Expense[];
  /** Each expense's current share of the pot, by id. */
  sharesById: Record<string, Cents>;
  /** What's paid towards each expense so far, by id. */
  progress: Record<string, ExpenseProgress>;
  /** Opens the Pay window for an expense. */
  onPay: (id: string) => void;
  /** The payment just made, with a way to undo it; null when there's none to show. */
  lastPayment: { text: string; onUndo: () => void } | null;
  /** Day of the month pay arrives. */
  payday: number;
  onUpdate: (id: string, fields: ExpenseFields) => void;
  onRemove: (id: string) => void;
  onRestore: (envelope: Expense, index: number) => void;
  /** Which form is open: an envelope id, NEW_EXPENSE, or null. One at a time. */
  openForm: string | null;
  onOpenFormChange: (formKey: string | null) => void;
  /** What saving an edit would change: the draft replaces the expense with this id. */
  previewFor?: (fields: ExpenseFields, replaceId: string) => ExpensePreview;
  /** How a paycheck is named in the preview, e.g. "21 Dec". */
  paycheckLabel?: (month: Month) => string;
  /** How each expense fills up on one time axis; missing for example data. */
  fillUp?: { view: FillUpView; currentDone: boolean };
}

/** The openForm value meaning "the add-an-expense form". */
export const NEW_EXPENSE = 'new';

/** Your known future expenses: add, edit in place, delete with undo. */
export function ExpenseList({
  envelopes,
  sharesById,
  progress,
  onPay,
  lastPayment,
  payday,
  onUpdate,
  onRemove,
  onRestore,
  openForm,
  onOpenFormChange,
  previewFor,
  paycheckLabel,
  fillUp,
}: ExpenseListProps) {
  const [lastDeleted, setLastDeleted] = useState<{ envelope: Expense; index: number } | null>(null);

  const byDueMonth = [...envelopes].sort(
    (a, b) => a.dueMonth.localeCompare(b.dueMonth) || a.name.localeCompare(b.name),
  );

  // The bars and the month names scroll sideways as one: like rulers glued
  // together, moving one moves them all.
  const scrollArea = useRef<HTMLDivElement>(null);

  function scrollersIn(area: HTMLElement): HTMLElement[] {
    return [...area.querySelectorAll<HTMLElement>('.fu-scroll')];
  }

  // Scroll events don't bubble up, so the area listens in the "capture" phase,
  // on their way down to the bar being scrolled.
  useEffect(() => {
    const area = scrollArea.current;
    if (area === null) return;
    function followAlong(event: Event): void {
      const source = event.target;
      if (area === null || !(source instanceof HTMLElement) || !source.classList.contains('fu-scroll')) return;
      for (const scroller of scrollersIn(area)) {
        if (scroller !== source && scroller.scrollLeft !== source.scrollLeft) scroller.scrollLeft = source.scrollLeft;
      }
    }
    area.addEventListener('scroll', followAlong, { capture: true, passive: true });
    return () => area.removeEventListener('scroll', followAlong, { capture: true });
  }, []);

  // A bar that appears later (after editing, or a new expense) joins at the same position.
  useLayoutEffect(() => {
    const area = scrollArea.current;
    if (area === null) return;
    const [axis, ...bars] = scrollersIn(area);
    if (axis === undefined) return;
    for (const bar of bars) if (bar.scrollLeft !== axis.scrollLeft) bar.scrollLeft = axis.scrollLeft;
  });

  function openFormFor(formKey: string): void {
    onOpenFormChange(formKey);
    setLastDeleted(null);
  }

  function handleDelete(envelope: Expense): void {
    // Remember its position in the saved list, so Undo restores it exactly.
    const index = envelopes.findIndex((candidate) => candidate.id === envelope.id);
    onRemove(envelope.id);
    setLastDeleted({ envelope, index });
    onOpenFormChange(null);
  }

  function handleUndo(): void {
    if (lastDeleted === null) return;
    onRestore(lastDeleted.envelope, lastDeleted.index);
    setLastDeleted(null);
  }

  return (
    <section className="expenses" aria-labelledby="expenses-title">
      <h2 id="expenses-title" className="expenses-title">
        Your expenses
      </h2>

      <div className="undo-area" aria-live="polite">
        {lastPayment !== null && (
          <p className="undo-bar">
            <span>{lastPayment.text}</span>
            <button type="button" className="button-text" onClick={lastPayment.onUndo}>
              Undo
            </button>
          </p>
        )}
        {lastDeleted !== null && (
          <p className="undo-bar">
            <span>Deleted “{lastDeleted.envelope.name}”</span>
            <button type="button" className="button-text" onClick={handleUndo}>
              Undo
            </button>
          </p>
        )}
      </div>

      {byDueMonth.length === 0 && openForm !== NEW_EXPENSE && (
        <p className="expenses-empty">
          List the one-off expenses you know are coming: a trip, new tyres, a birthday. Rough amounts and
          months are fine; you can refine them later.
        </p>
      )}

      <div
        ref={scrollArea}
        // Each paycheck needs room; long plans become wider than the screen and scroll.
        style={{ '--paychecks': fillUp?.view.paychecks ?? 1 } as CSSProperties}
      >
        {/* The month names, once, lined up with the bars in the rows below. */}
        {byDueMonth.length > 0 && fillUp !== undefined && (
          <div className="expense-axis">
            <FillUpAxis view={fillUp.view} />
          </div>
        )}

        {byDueMonth.length > 0 && (
          <ul className="expense-list">
            {byDueMonth.map((envelope) =>
              openForm === envelope.id ? (
                <li key={envelope.id} className="expense-row expense-row--editing">
                  <ExpenseForm
                    initial={envelope}
                    payday={payday}
                    submitLabel="Save changes"
                    previewFor={previewFor === undefined ? undefined : (fields) => previewFor(fields, envelope.id)}
                    paycheckLabel={paycheckLabel}
                    onSave={(fields) => {
                      onUpdate(envelope.id, fields);
                      onOpenFormChange(null);
                    }}
                    onCancel={() => onOpenFormChange(null)}
                  />
                </li>
              ) : (
                <ExpenseRow
                  key={envelope.id}
                  envelope={envelope}
                  shareCents={sharesById[envelope.id]}
                  paidCents={progress[envelope.id]?.paidCents ?? 0}
                  onPay={() => onPay(envelope.id)}
                  onEdit={() => openFormFor(envelope.id)}
                  onDelete={() => handleDelete(envelope)}
                  payday={payday}
                  fillUp={fillUp}
                />
              ),
            )}
          </ul>
        )}
      </div>

      {/* Opens the add-an-expense dialog, the same one as in the top card. */}
      <button type="button" className="button-primary add-button" onClick={() => openFormFor(NEW_EXPENSE)}>
        Add an expense
      </button>
    </section>
  );
}

interface ExpenseRowProps {
  envelope: Expense;
  /** Its share of the pot; missing once it's paid and settled. */
  shareCents: Cents | undefined;
  /** Paid towards it so far. */
  paidCents: Cents;
  payday: number;
  onPay: () => void;
  onEdit: () => void;
  onDelete: () => void;
  fillUp: ExpenseListProps['fillUp'];
}

function ExpenseRow({ envelope, shareCents, paidCents, payday, onPay, onEdit, onDelete, fillUp }: ExpenseRowProps) {
  const bar = fillUp?.view.rows[envelope.id];
  const isPaidInFull = paidCents >= envelope.targetCents;
  // What's paid already; the rest of the text is about what's still to pay.
  const paid = isPaidInFull ? ['paid in full'] : paidCents > 0 ? [`${formatEuros(paidCents)}\u00a0paid`] : [];
  // With a bar, its dots already show the paydays, so the text stays short.
  const details =
    bar !== undefined
      ? [
          formatEuros(envelope.targetCents),
          `due ${formatDue(envelope)}`,
          ...paid,
          `${formatEuros(bar.inPotCents)}\u00a0in\u00a0pot`,
        ]
      : [
          formatEuros(envelope.targetCents),
          `due ${formatDue(envelope)}`,
          ...paid,
          ...(payday === DEFAULT_PAYDAY || isPaidInFull
            ? []
            : [
                `last set-aside ${formatDayShort(paycheckDates(fundingMonth(envelope, payday), payday).last)}`,
              ]),
          ...(shareCents === undefined || isPaidInFull ? [] : [`${formatEuros(shareCents)} of it in the pot`]),
        ];

  return (
    <li className={fillUp === undefined ? 'expense-row' : 'expense-row expense-row--with-bar'}>
      <div className="expense-text">
        <p className="expense-name">{envelope.name}</p>
        <p className="expense-details">{details.join(' · ')}</p>
      </div>
      {fillUp !== undefined && (
        <div className="expense-bar">
          {bar !== undefined && <FillUpBar row={bar} view={fillUp.view} currentDone={fillUp.currentDone} />}
        </div>
      )}
      <div className="expense-actions">
        {!isPaidInFull && (
          <button type="button" className="button-text" onClick={onPay} aria-label={`Pay towards ${envelope.name}`}>
            Pay
          </button>
        )}
        <button type="button" className="button-text" onClick={onEdit} aria-label={`Edit ${envelope.name}`}>
          Edit
        </button>
        <button
          type="button"
          className="button-text button-text--danger"
          onClick={onDelete}
          aria-label={`Delete ${envelope.name}`}
        >
          Delete
        </button>
      </div>
    </li>
  );
}
