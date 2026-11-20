import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { ExpensePreview } from '../engine/expensePreview';
import type { FillUpView } from '../engine/fillUp';
import type { Cents, Expense, ExpenseFields, Month } from '../engine/types';
import { fundingMonth, DEFAULT_PAYDAY, paycheckDates } from '../engine/timing';
import { formatDayShort, formatDue, formatEuros, formatMonthShort } from '../utils/format';
import { ExpenseForm } from './ExpenseForm';
import { FillUpAxis, FillUpBar } from './FillUpBar';

interface ExpenseListProps {
  envelopes: Expense[];
  /** Each expense's current share of the pot, by id. */
  sharesById: Record<string, Cents>;
  currentMonth: Month;
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
  currentMonth,
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
                    currentMonth={currentMonth}
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
  payday: number;
  onEdit: () => void;
  onDelete: () => void;
  fillUp: ExpenseListProps['fillUp'];
}

function ExpenseRow({ envelope, shareCents, payday, onEdit, onDelete, fillUp }: ExpenseRowProps) {
  const bar = fillUp?.view.rows[envelope.id];
  // With a bar, its dots already show the paydays, so the text stays short.
  const details =
    bar !== undefined
      ? [
          formatEuros(envelope.targetCents),
          `due ${formatDue(envelope)}`,
          `${formatEuros(bar.inPotCents)}\u00a0in\u00a0pot`,
        ]
      : [
          formatEuros(envelope.targetCents),
          `due ${formatDue(envelope)}`,
          ...(payday === DEFAULT_PAYDAY
            ? []
            : [
                `last set-aside ${formatDayShort(paycheckDates(fundingMonth(envelope, payday), payday).last)}`,
              ]),
          ...(shareCents === undefined ? [] : [`${formatEuros(shareCents)} of it in the pot`]),
        ];
  if (envelope.paidMonth !== undefined) details.push(`paid ${formatMonthShort(envelope.paidMonth)}`);

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
