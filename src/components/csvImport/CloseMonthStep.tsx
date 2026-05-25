import { formatCurrency, formatMonth } from '../../utils/formatting';
import type { Month } from '../../engine/types';
import type { EngineOutput } from '../../engine/types';
import type { ReconciliationSummary } from '../../engine/csvImportTypes';

interface Props {
  affectedMonths: Month[];
  summariesByMonth: Record<Month, ReconciliationSummary>;
  incomeUpdateResult: { month: Month; from: number; to: number }[];
  engine: EngineOutput;
  onClose: () => void;
}

export default function CloseMonthStep({
  affectedMonths,
  summariesByMonth,
  incomeUpdateResult,
  engine,
  onClose,
}: Props) {
  return (
    <div className="csv-step">
      <h3 className="csv-close-title">Period settled</h3>
      <p className="csv-step-intro">
        Updated {affectedMonths.map(m => formatMonth(m)).join(', ')} from your import.
      </p>
      {incomeUpdateResult.length > 0 && (
        <div className="csv-hint csv-income-update-done">
          <p>Income saved per month:</p>
          <ul>
            {incomeUpdateResult.map(row => (
              <li key={row.month}>
                {formatMonth(row.month)}:{' '}
                <strong className="num">{formatCurrency(row.from)}</strong>
                {' → '}
                <strong className="num">{formatCurrency(row.to)}</strong>
              </li>
            ))}
          </ul>
          <p>Timeline and free-budget use each month&apos;s own income where set.</p>
        </div>
      )}
      <ul className="csv-close-summary">
        {affectedMonths.map(month => {
          const monthResult = engine.months.find(m => m.month === month);
          const summary = summariesByMonth[month];
          return (
            <li key={month}>
              <strong>{formatMonth(month)}</strong> — pot{' '}
              <span className="num">
                {monthResult ? formatCurrency(monthResult.physicalPotAfter) : '—'}
              </span>
              {summary && (
                <> · free spend <span className="num">{formatCurrency(summary.freeBudgetSpendTotal)}</span></>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
