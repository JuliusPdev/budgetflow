import { formatCurrencyExact } from '../../utils/formatting';
import type { BudgetState } from '../../engine/types';
import type { LeftoverAllocation } from '../../engine/csvImportTypes';

interface Props {
  monthLabel?: string;
  amount: number;
  allocation: LeftoverAllocation;
  savingsGoalId?: string;
  budget: BudgetState;
  onSetAllocation: (a: LeftoverAllocation, goalId?: string) => void;
}

export default function LeftoverFreeBudgetStep({
  monthLabel,
  amount,
  allocation,
  savingsGoalId,
  budget,
  onSetAllocation,
}: Props) {
  const targetGoals = budget.savingsGoals.filter(
    (g): g is Extract<typeof g, { mode: 'target' }> => g.mode === 'target',
  );

  return (
    <div className="csv-step">
      <p className="csv-step-intro">
        {monthLabel ? <><strong>{monthLabel}</strong> — </> : null}You have {formatCurrencyExact(amount)} left over from this month&apos;s free budget
        (unspent from your checking account). What would you like to do?
      </p>
      <div className="mc-surplus-options">
        <button
          type="button"
          className={`mc-surplus-option ${allocation === 'pot' ? 'mc-surplus-option--selected' : ''}`}
          onClick={() => onSetAllocation('pot')}
        >
          <span className="mc-surplus-option-title">Add to pot</span>
        </button>
        {targetGoals.map(g => (
          <button
            key={g.id}
            type="button"
            className={`mc-surplus-option ${allocation === 'savings' && savingsGoalId === g.id ? 'mc-surplus-option--selected' : ''}`}
            onClick={() => onSetAllocation('savings', g.id)}
          >
            <span className="mc-surplus-option-title">→ {g.name}</span>
          </button>
        ))}
        <button
          type="button"
          className={`mc-surplus-option ${allocation === 'carry' ? 'mc-surplus-option--selected' : ''}`}
          onClick={() => onSetAllocation('carry')}
        >
          <span className="mc-surplus-option-title">Carry forward to next month</span>
        </button>
      </div>
    </div>
  );
}
