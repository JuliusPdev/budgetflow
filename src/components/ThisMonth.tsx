import type { ReactNode } from 'react';
import { loanCents, type MonthPlan } from '../engine/plan';
import { REFILL_ID } from '../engine/pot';
import type { Cents, Day, Envelope } from '../engine/types';
import { formatDayLong, formatDue, formatEuros, formatMonthShort } from '../utils/format';

interface ThisMonthProps {
  /** The plan's first month; missing when there is nothing to save for. */
  monthPlan: MonthPlan | undefined;
  envelopes: Envelope[];
  /** Made-up example data: drawn dashed and tagged so it isn't mistaken for yours. */
  isExample?: boolean;
  /** With a payday set: the savings phase, from last to next payday, e.g. "21 Oct – 21 Nov". */
  paycheckLabel?: string;
  /** Today, shown as the title so it's easy to compare with the savings phase. */
  today: Day;
  /**
   * What's still missing of this period's plan after what you've logged.
   * Left out for examples, which have no log: then the full plan is shown.
   */
  stillOpenCents?: Cents;
  /** You're behind and the pot covers the closest deadlines first: say so. */
  closestFirst?: boolean;
  /** Opens the add-an-expense dialog; missing while examples are shown. */
  onAddExpense?: () => void;
  /** Extra content under the headline amount, e.g. this month's progress. */
  children?: ReactNode;
}

/** The headline: how much to put aside this month, and what it is for. */
export function ThisMonth({
  monthPlan,
  envelopes,
  isExample = false,
  paycheckLabel,
  today,
  stillOpenCents,
  closestFirst = false,
  onAddExpense,
  children,
}: ThisMonthProps) {
  const addButton = onAddExpense !== undefined && (
    <button type="button" className="button-secondary add-expense-top" onClick={onAddExpense}>
      Add an expense
    </button>
  );

  if (monthPlan === undefined) {
    return (
      <section className="this-month">
        <p className="eyebrow">This month</p>
        <h1 className="this-month-title">Nothing to set aside</h1>
        <p className="goal-detail">Add an expense you know is coming to see your monthly amount.</p>
        {addButton}
      </section>
    );
  }

  // Envelopes in the order the plan gives them: closest deadline first.
  const goals = Object.entries(monthPlan.byEnvelope).flatMap(([id, shareCents]) => {
    const envelope = envelopes.find((candidate) => candidate.id === id);
    return envelope === undefined ? [] : [{ envelope, shareCents }];
  });

  return (
    <section
      className={isExample ? 'this-month this-month--example' : 'this-month'}
      aria-labelledby="this-month-title"
    >
      <div className="this-month-headline">
        <p className="eyebrow">
          {paycheckLabel === undefined ? 'This month' : `Current savings phase · ${paycheckLabel}`}
          {isExample && <span className="example-tag">Example</span>}
        </p>
        <h1 id="this-month-title" className="this-month-title">
          {formatDayLong(today)}
        </h1>
        {stillOpenCents === undefined ? (
          <p className="headline">
            <span className="headline-label">Put aside</span>
            <span className="headline-amount figures">{formatEuros(monthPlan.totalCents)}</span>
          </p>
        ) : (
          // The big number is only what's still missing, so it never looks owed once it's done.
          <p className="headline">
            {stillOpenCents > 0 ? (
              <>
                <span className="headline-label">Still to put aside</span>
                <span className="headline-amount figures">{formatEuros(stillOpenCents)}</span>
              </>
            ) : (
              <>
                <span className="headline-label">{paycheckLabel === undefined ? 'This month' : 'This savings phase'}</span>
                <span className="headline-amount headline-done">Done</span>
              </>
            )}
          </p>
        )}
        {children}
      </div>

      <div className="this-month-goals">
        <h2 className="section-label">What it's for</h2>
        {closestFirst && (
          <p className="field-hint closest-note">
            You're behind your plan, so your pot covers your closest deadlines first. Catch up, and your
            expenses fill together again.
          </p>
        )}
        <ul className="goals">
          {goals.map(({ envelope, shareCents }) => (
            <GoalLine key={envelope.id} envelope={envelope} shareCents={shareCents} />
          ))}
        </ul>
        {addButton}
      </div>
    </section>
  );
}

interface GoalLineProps {
  envelope: Envelope;
  shareCents: Cents;
}

function GoalLine({ envelope, shareCents }: GoalLineProps) {
  const loan = loanCents(envelope);
  const progress = Math.min(1, envelope.savedCents / envelope.targetCents);

  // A paid-early goal tells the repayment story instead of the saving story.
  const detail =
    envelope.id === REFILL_ID
      ? 'More went out of your pot than came in. This puts it back first.'
      : envelope.paidMonth !== undefined && loan > 0
      ? `Paid ${formatMonthShort(envelope.paidMonth)} · repaying ${formatEuros(loan)} by ${formatDue(envelope)}`
      : `${formatEuros(envelope.savedCents)} of ${formatEuros(envelope.targetCents)} · due ${formatDue(envelope)}`;

  return (
    <li className={loan > 0 ? 'goal goal--repaying' : 'goal'}>
      <div className="goal-top">
        <span className="goal-name">{envelope.name}</span>
        <span className="goal-share figures">{formatEuros(shareCents)}</span>
      </div>
      {/* The bar repeats the numbers in the text below, so screen readers skip it. */}
      <div className="goal-bar" aria-hidden="true">
        <span className="goal-bar-fill" style={{ width: `${progress * 100}%` }} />
      </div>
      <p className="goal-detail">{detail}</p>
    </li>
  );
}
