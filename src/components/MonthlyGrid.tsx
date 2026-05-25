import { useRef, useEffect } from 'react';
import MonthCard from './MonthCard';
import type { BudgetState, EngineOutput, Month, PlannedExpense } from '../engine/types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  engine:                EngineOutput;
  budget:                BudgetState;
  currentMonth:          Month;
  addPlannedExpense:     (e: Omit<PlannedExpense, 'id'>) => void;
  updatePlannedExpense:  (id: string, changes: Partial<Omit<PlannedExpense, 'id'>>) => void;
  removePlannedExpense:  (id: string) => void;
  removeUnplannedExpense:(id: string) => void;
  isMonthReconciled:     (month: Month) => boolean;
  onStartReconciliation: (month: Month) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MonthlyGrid({
  engine,
  budget,
  currentMonth,
  addPlannedExpense,
  updatePlannedExpense,
  removePlannedExpense,
  removeUnplannedExpense,
  isMonthReconciled,
  onStartReconciliation,
}: Props) {

  // useRef attaches a "handle" to the scrollable container <div> below.
  // Once React has rendered it, scrollRef.current points to the actual
  // browser DOM element, so we can call scrolling methods on it.
  const scrollRef = useRef<HTMLDivElement>(null);

  // useEffect runs once after the component first appears on screen.
  // We wrap the scroll in requestAnimationFrame so it runs after the browser
  // has finished painting and measuring card positions. Without this, offsetLeft
  // can return 0 on a hard reload because layout hasn't been calculated yet.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const container = scrollRef.current;
      if (!container) return;
      const currentCard = container.querySelector<HTMLElement>('.month-card--current');
      if (currentCard) {
        // scrollLeft sets how far the container is scrolled horizontally.
        // We subtract 16px (one spacing unit) so the card isn't flush with
        // the left edge — it feels more comfortable with a small gap.
        container.scrollLeft = currentCard.offsetLeft - 16;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []); // The empty array [] means "run this effect only once, on mount."

  return (
    <div className="monthly-grid-wrapper" data-testid="monthly-grid">
      <div className="monthly-grid" ref={scrollRef}>
        {engine.months.map(result => (
          <MonthCard
            key={result.month}
            result={result}
            budget={budget}
            engine={engine}
            currentMonth={currentMonth}
            isCurrentMonth={result.month === currentMonth}
            isPastMonth={result.month < currentMonth}
            isReconciled={isMonthReconciled(result.month)}
            addPlannedExpense={addPlannedExpense}
            updatePlannedExpense={updatePlannedExpense}
            removePlannedExpense={removePlannedExpense}
            removeUnplannedExpense={removeUnplannedExpense}
            onStartReconciliation={onStartReconciliation}
          />
        ))}
      </div>
    </div>
  );
}
