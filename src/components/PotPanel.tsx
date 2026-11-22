import { useId, type ReactNode } from 'react';
import type { PotShares } from '../engine/pot';
import type { Cents, LogEntry } from '../engine/types';
import { formatEuros } from '../utils/format';
import { PotHistory } from './PotHistory';

interface PotPanelProps {
  potCents: Cents;
  potShares: PotShares;
  /** True while the pot covers the closest deadlines first instead of following the plan. */
  closestFirst: boolean;
  log: LogEntry[];
  onChangeAmount: (entryId: string, amountCents: Cents) => void;
  onDelete: (entryId: string) => void;
  /** An expense's name by its id, for payments in the history. */
  nameOf: (envelopeId: string) => string | undefined;
  /** Why a new amount for a history entry isn't allowed, or null when it is. */
  problemWith?: (entry: LogEntry, amountCents: Cents) => string | null;
  /** Taking money out, shown with the pot's other actions. */
  children?: ReactNode;
}

/**
 * What's in your pot and what it's meant for. Money only moves by setting
 * aside, taking out or paying; a wrong entry is fixed in the history.
 */
export function PotPanel({
  potCents,
  potShares,
  closestFirst,
  log,
  onChangeAmount,
  onDelete,
  nameOf,
  problemWith,
  children,
}: PotPanelProps) {
  const id = useId();
  const forExpensesCents = Object.values(potShares.shares).reduce((sum, cents) => sum + cents, 0);

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

      {children}

      <PotHistory log={log} onChangeAmount={onChangeAmount} onDelete={onDelete} nameOf={nameOf} problemWith={problemWith} />
    </section>
  );
}
