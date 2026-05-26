import { formatCurrency } from '../../utils/formatting';
import type { BudgetState, Month } from '../../engine/types';
import type { EnvelopeSurplusDecision, EnvelopeSurplusChoice } from '../../engine/csvImportTypes';

interface Props {
  pending: { month: Month; envelopeId: string; name: string; surplus: number }[];
  decisions: EnvelopeSurplusDecision[];
  budget: BudgetState;
  onSetDecision: (d: EnvelopeSurplusDecision) => void;
}

export default function EnvelopeSurplusStep({
  pending,
  decisions,
  budget,
  onSetDecision,
}: Props) {
  const targetGoals = budget.savingsGoals.filter(
    (g): g is Extract<typeof g, { mode: 'target' }> => g.mode === 'target',
  );

  return (
    <div className="csv-step">
      <p className="csv-step-intro">You underspent on some envelopes. Where should the surplus go?</p>

      {pending.map(p => {
        const d = decisions.find(x => x.month === p.month && x.envelopeId === p.envelopeId);
        const choice = d?.choice ?? 'pot';

        function pick(c: EnvelopeSurplusChoice, savingsGoalId?: string) {
          onSetDecision({
            month: p.month,
            envelopeId: p.envelopeId,
            surplus: p.surplus,
            choice: c,
            savingsGoalId,
          });
        }

        return (
          <div key={`${p.month}-${p.envelopeId}`} className="csv-surplus-card">
            <h3 className="csv-surplus-title">
              {p.name}: spent less than planned by {formatCurrency(p.surplus)}
            </h3>
            <div className="mc-surplus-options">
              <button
                type="button"
                className={`mc-surplus-option ${choice === 'pot' ? 'mc-surplus-option--selected' : ''}`}
                onClick={() => pick('pot')}
              >
                <span className="mc-surplus-option-title">Add to pot</span>
              </button>
              {targetGoals.map(g => (
                <button
                  key={g.id}
                  type="button"
                  className={`mc-surplus-option ${choice === 'savings' && d?.savingsGoalId === g.id ? 'mc-surplus-option--selected' : ''}`}
                  onClick={() => pick('savings', g.id)}
                >
                  <span className="mc-surplus-option-title">→ {g.name}</span>
                </button>
              ))}
              <button
                type="button"
                className={`mc-surplus-option ${choice === 'carry' ? 'mc-surplus-option--selected' : ''}`}
                onClick={() => pick('carry')}
              >
                <span className="mc-surplus-option-title">Carry to next month</span>
              </button>
            </div>
          </div>
        );
      })}

    </div>
  );
}
