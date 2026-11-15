import { loanCents, type MonthPlan } from '../engine/plan';
import type { Cents, Envelope } from '../engine/types';
import { formatEuros, formatMonthLong, formatMonthShort } from '../utils/format';

interface ThisMonthProps {
  /** The plan's first month; missing when there is nothing to save for. */
  monthPlan: MonthPlan | undefined;
  envelopes: Envelope[];
}

/** The headline: how much to put aside this month, and what it is for. */
export function ThisMonth({ monthPlan, envelopes }: ThisMonthProps) {
  if (monthPlan === undefined) {
    return (
      <section className="this-month">
        <p className="eyebrow">This month</p>
        <h1 className="this-month-title">Nothing to set aside</h1>
        <p className="goal-detail">Add an expense you know is coming to see your monthly amount.</p>
      </section>
    );
  }

  // Envelopes in the order the plan gives them: closest deadline first.
  const goals = Object.entries(monthPlan.byEnvelope).flatMap(([id, shareCents]) => {
    const envelope = envelopes.find((candidate) => candidate.id === id);
    return envelope === undefined ? [] : [{ envelope, shareCents }];
  });

  return (
    <section className="this-month" aria-labelledby="this-month-title">
      <div className="this-month-headline">
        <p className="eyebrow">This month</p>
        <h1 id="this-month-title" className="this-month-title">
          {formatMonthLong(monthPlan.month)}
        </h1>
        <p className="headline">
          <span className="headline-label">Put aside</span>
          <span className="headline-amount figures">{formatEuros(monthPlan.totalCents)}</span>
        </p>
      </div>

      <div className="this-month-goals">
        <h2 className="section-label">What it's for</h2>
        <ul className="goals">
          {goals.map(({ envelope, shareCents }) => (
            <GoalLine key={envelope.id} envelope={envelope} shareCents={shareCents} />
          ))}
        </ul>
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
    envelope.paidMonth !== undefined && loan > 0
      ? `Paid ${formatMonthShort(envelope.paidMonth)} · repaying ${formatEuros(loan)} by ${formatMonthShort(envelope.dueMonth)}`
      : `${formatEuros(envelope.savedCents)} of ${formatEuros(envelope.targetCents)} · due ${formatMonthShort(envelope.dueMonth)}`;

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
