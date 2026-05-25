import { formatCurrency, formatCurrencyExact, formatMonth } from '../../utils/formatting';
import type { BudgetState, Month } from '../../engine/types';
import type {
  PlannedExpenseSurplusDecision,
  ReconciliationSummary,
} from '../../engine/csvImportTypes';

interface Props {
  budget: BudgetState;
  summariesByMonth: Record<Month, ReconciliationSummary>;
  affectedMonths: Month[];
  plannedExpenseSurplusDecisions: PlannedExpenseSurplusDecision[];
  plannedIncomeUpdatePreview: { month: Month; amount: number; previous: number }[];
  updatePlannedIncome: boolean;
  onSetUpdatePlannedIncome: (value: boolean) => void;
  onSetPlannedExpenseSurplusDecision: (decision: PlannedExpenseSurplusDecision) => void;
}

function MonthSummaryBlock({
  month,
  summary,
  plannedExpenseSurplusDecisions,
  onSetPlannedExpenseSurplusDecision,
}: {
  month: Month;
  summary: ReconciliationSummary;
  plannedExpenseSurplusDecisions: PlannedExpenseSurplusDecision[];
  onSetPlannedExpenseSurplusDecision: (decision: PlannedExpenseSurplusDecision) => void;
}) {
  return (
    <section className="csv-summary-month-block">
      <h3 className="csv-summary-month-title">{formatMonth(month)}</h3>
      <dl className="csv-summary-list">
        <dt>Income confirmed</dt>
        <dd className="num">{formatCurrencyExact(summary.incomeTotal)}</dd>
        {summary.envelopeActuals.map(e => (
          <div key={e.id} className="csv-summary-block">
            <dt>{e.name}</dt>
            <dd className="num">
              planned {formatCurrency(e.planned)}, actual {formatCurrencyExact(e.actual)}
            </dd>
          </div>
        ))}
        <dt>Pot transfer</dt>
        <dd className="num">
          {summary.potTransferConfirmed
            ? formatCurrencyExact(summary.potTransferAmount)
            : 'Not found'}
        </dd>
        <dt>Free budget spend</dt>
        <dd className="num">{formatCurrencyExact(summary.freeBudgetSpendTotal)}</dd>
        {summary.settledExpenses
          .filter(s => s.actual < s.planned)
          .map(s => (
            <dd key={s.id}>
              <label className="csv-field-label" htmlFor={`planned-surplus-${s.id}`}>
                {s.name} surplus
              </label>
              <select
                id={`planned-surplus-${s.id}`}
                className="csv-select"
                value={
                  plannedExpenseSurplusDecisions.find(d => d.plannedExpenseId === s.id)?.choice ?? 'pot'
                }
                onChange={e =>
                  onSetPlannedExpenseSurplusDecision({
                    plannedExpenseId: s.id,
                    surplus: s.planned - s.actual,
                    choice: e.target.value as PlannedExpenseSurplusDecision['choice'],
                  })
                }
              >
                <option value="pot">Keep surplus in pot</option>
                <option value="free">Free up to free budget</option>
              </select>
            </dd>
          ))}
      </dl>
    </section>
  );
}

export default function ReconciliationSummaryStep({
  budget,
  summariesByMonth,
  affectedMonths,
  plannedExpenseSurplusDecisions,
  plannedIncomeUpdatePreview,
  updatePlannedIncome,
  onSetUpdatePlannedIncome,
  onSetPlannedExpenseSurplusDecision,
}: Props) {
  return (
    <div className="csv-step">
      <p className="csv-step-intro">Review the summary for each calendar month in this period.</p>
      {plannedIncomeUpdatePreview.length > 0 && (
        <label className="csv-income-update-offer">
          <input
            type="checkbox"
            checked={updatePlannedIncome}
            onChange={e => onSetUpdatePlannedIncome(e.target.checked)}
          />
          <span>
            Save confirmed income per month:
            <ul className="csv-income-update-list">
              {plannedIncomeUpdatePreview.map(row => (
                <li key={row.month}>
                  {formatMonth(row.month)}:{' '}
                  <strong className="num">{formatCurrencyExact(row.previous)}</strong>
                  {' → '}
                  <strong className="num">{formatCurrencyExact(row.amount)}</strong>
                </li>
              ))}
            </ul>
            Future months without a confirmed amount still use{' '}
            <strong className="num">{formatCurrencyExact(budget.income)}</strong> as the default.
          </span>
        </label>
      )}
      {affectedMonths.map(month => (
        <MonthSummaryBlock
          key={month}
          month={month}
          summary={summariesByMonth[month]}
          plannedExpenseSurplusDecisions={plannedExpenseSurplusDecisions}
          onSetPlannedExpenseSurplusDecision={onSetPlannedExpenseSurplusDecision}
        />
      ))}
    </div>
  );
}
