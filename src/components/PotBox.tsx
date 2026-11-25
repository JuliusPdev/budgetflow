import { useId, useState, type ReactNode } from 'react';
import type { PotShares } from '../engine/pot';
import type { Cents } from '../engine/types';
import { formatEuros } from '../utils/format';

interface PotBoxProps {
  potCents: Cents;
  potShares: PotShares;
  /** The pot's details: history, taking money out, the chart. Shown once opened. */
  children: ReactNode;
}

/**
 * The pot in one line: what's in it and what it's for. "Details" folds out
 * everything else, so the pot doesn't take over the page.
 */
export function PotBox({ potCents, potShares, children }: PotBoxProps) {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  // What's really in the pot for expenses; the shares would count money already paid.
  const forExpensesCents = Math.max(0, potCents - potShares.extraCents);
  const summary =
    potShares.shortfallCents > 0
      ? `${formatEuros(potShares.shortfallCents)} to put back first`
      : potShares.extraCents > 0
        ? `${formatEuros(forExpensesCents)} for your expenses · ${formatEuros(potShares.extraCents)} extra`
        : 'all meant for your expenses';

  return (
    <section className="pot-box" aria-labelledby={`${id}-title`}>
      <button
        type="button"
        className="pot-box-toggle"
        aria-expanded={isOpen}
        aria-controls={`${id}-details`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="pot-box-text">
          <span id={`${id}-title`} className="pot-box-label">
            In your pot
          </span>
          <span className="pot-box-amount figures">{formatEuros(potCents)}</span>
          <span className={potShares.shortfallCents > 0 ? 'pot-box-summary is-short' : 'pot-box-summary'}>{summary}</span>
        </span>
        <span className="pot-box-more">
          {isOpen ? 'Hide' : 'Details'}
          <span aria-hidden="true">{isOpen ? ' ˄' : ' ›'}</span>
        </span>
      </button>
      {isOpen && (
        <div id={`${id}-details`} className="pot-box-details">
          {children}
        </div>
      )}
    </section>
  );
}
