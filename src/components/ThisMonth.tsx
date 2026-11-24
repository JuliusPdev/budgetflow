import type { ReactNode } from 'react';
import { ownerOf, type ExpenseProgress } from '../engine/payments';
import type { MonthPlan } from '../engine/plan';
import { REFILL_ID } from '../engine/pot';
import type { Cents, Day, Envelope } from '../engine/types';
import { formatDayLong, formatDayShort, formatDue, formatEuros } from '../utils/format';

interface ThisMonthProps {
  /** The plan's first month; missing when there is nothing to save for. */
  monthPlan: MonthPlan | undefined;
  /** Your expenses with their share of the pot; ones with payments come in parts. */
  envelopes: Envelope[];
  /** Each expense's parts added back together, by its id. */
  progress: Record<string, ExpenseProgress>;
  /** Made-up example data: drawn dashed and tagged so it isn't mistaken for yours. */
  isExample?: boolean;
  /** With a payday set: the current paycheck, from last to next payday, e.g. "21 Oct – 21 Nov". */
  paycheckLabel?: string;
  /** Today, shown as the title so it's easy to compare with the current paycheck. */
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
  progress,
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

  // Expenses in the order the plan gives them: closest deadline first. The
  // parts of an expense with payments are added back into one line.
  const goals: { owner: string; envelope: Envelope; shareCents: Cents }[] = [];
  for (const [id, shareCents] of Object.entries(monthPlan.byEnvelope)) {
    // An expense's amounts are already added up under its own id; a fully paid one has only paid parts.
    const envelope = envelopes.find((candidate) => ownerOf(candidate) === id);
    if (envelope === undefined) continue;
    const owner = ownerOf(envelope);
    const existing = goals.find((goal) => goal.owner === owner);
    if (existing !== undefined) existing.shareCents += shareCents;
    else goals.push({ owner, envelope, shareCents });
  }
  // Finished ones still count toward this paycheck, but fold away so the open ones lead.
  const openGoals = goals.filter((goal) => goal.envelope.done === undefined);
  const doneGoals = goals.filter((goal) => goal.envelope.done !== undefined);
  const doneShareCents = doneGoals.reduce((sum, goal) => sum + goal.shareCents, 0);

  function renderGoal({ owner, envelope, shareCents }: (typeof goals)[number]) {
    // The part still to pay carries the expense's own id; without one, it's all paid.
    const stillToPay = envelopes.find((candidate) => candidate.id === owner);
    const paidCents = progress[owner]?.paidCents ?? 0;
    return (
      <GoalLine
        key={owner}
        envelope={envelope}
        shareCents={shareCents}
        targetCents={paidCents + (stillToPay?.targetCents ?? 0)}
        paidCents={paidCents}
        coveredCents={progress[owner]?.coveredCents ?? envelope.savedCents}
      />
    );
  }

  return (
    <section
      className={isExample ? 'this-month this-month--example' : 'this-month'}
      aria-labelledby="this-month-title"
    >
      <div className="this-month-headline">
        <p className="eyebrow">
          {paycheckLabel === undefined ? 'This month' : `Current paycheck · ${paycheckLabel}`}
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
                <span className="headline-label">{paycheckLabel === undefined ? 'This month' : 'This paycheck'}</span>
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
        {openGoals.length > 0 && <ul className="goals">{openGoals.map(renderGoal)}</ul>}
        {doneGoals.length > 0 && (
          <details className="goals-done">
            <summary>
              <span>Done this {paycheckLabel === undefined ? 'month' : 'paycheck'} · {doneGoals.length}</span>
              <span className="figures">{formatEuros(doneShareCents)}</span>
            </summary>
            <ul className="goals">{doneGoals.map(renderGoal)}</ul>
          </details>
        )}
        {addButton}
      </div>
    </section>
  );
}

interface GoalLineProps {
  /** One part of the expense, for its name and dates. */
  envelope: Envelope;
  /** This paycheck's amount for the whole expense. */
  shareCents: Cents;
  /** The whole expense's amount. */
  targetCents: Cents;
  paidCents: Cents;
  /** How much of it is taken care of: in the pot, or paid and put back. */
  coveredCents: Cents;
}

function GoalLine({ envelope, shareCents, targetCents, paidCents, coveredCents }: GoalLineProps) {
  const isRefill = envelope.id === REFILL_ID;
  const progress = Math.min(1, coveredCents / (isRefill ? envelope.targetCents : targetCents));
  const isPaidInFull = paidCents >= targetCents;
  const repayingCents = targetCents - coveredCents;
  const { done } = envelope;

  // Finished: marked done like in the timeline. Its amount stays, because it's part of this paycheck.
  if (done !== undefined) {
    return (
      <li className="goal goal--done">
        <div className="goal-top">
          <span className="goal-name">
            <span className="done-tag">✓ Done</span> {envelope.name}
          </span>
          <span className="goal-share figures">{formatEuros(shareCents)}</span>
        </div>
        <div className="goal-bar" aria-hidden="true">
          <span className="goal-bar-fill" style={{ width: '100%' }} />
        </div>
        <p className="goal-detail">
          Done {formatDayShort(done.date)} · cost {formatEuros(done.costCents)}
        </p>
      </li>
    );
  }

  // Paid in full but early: it tells the putting-back story instead of the saving story.
  const detail = isRefill
    ? 'More went out of your pot than came in. This puts it back first.'
    : isPaidInFull && repayingCents > 0
      ? `Paid · putting back ${formatEuros(repayingCents)} by ${formatDue(envelope)}`
      : paidCents > 0
        ? `${formatEuros(coveredCents)} of ${formatEuros(targetCents)} · ${formatEuros(paidCents)} paid · due ${formatDue(envelope)}`
        : `${formatEuros(coveredCents)} of ${formatEuros(targetCents)} · due ${formatDue(envelope)}`;

  return (
    <li className={isPaidInFull && repayingCents > 0 ? 'goal goal--repaying' : 'goal'}>
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
