import { addMonths } from '../../engine/smoothing';
import type { Month } from '../../engine/types';
import { formatMonth } from '../../utils/formatting';
import { DEV_MODE } from '../../utils/devMode';

interface Props {
  currentMonth: Month;
  defaultMonth: Month;
  rowCount: number;
  isReconcilable: (m: Month) => boolean;
  onSelect: (m: Month) => void;
}

export default function ImportMonthStep({
  currentMonth,
  defaultMonth,
  rowCount,
  isReconcilable,
  onSelect,
}: Props) {
  const options: Month[] = [];
  for (let i = 1; i <= 6; i++) {
    const m = addMonths(currentMonth, -i);
    if (isReconcilable(m)) options.push(m);
  }

  return (
    <div className="csv-step">
      <p className="csv-step-intro">
        Which month are you reconciling? Found {rowCount} transactions in the file.
      </p>
      <p className="csv-hint csv-month-current-note">
        <strong>{formatMonth(currentMonth)}</strong> is your current month, so it is not listed yet — reconciliation is for months that are already finished.
        {DEV_MODE && (
          <>
            {' '}To test with a CSV that includes this month&apos;s salary, click <strong>Next →</strong> in the dev toolbar at the top, then pick <strong>{formatMonth(addMonths(currentMonth, -1))}</strong> below.
          </>
        )}
      </p>
      <div className="csv-month-list">
        {options.map(m => (
          <button
            key={m}
            type="button"
            className={`csv-month-btn ${m === defaultMonth ? 'csv-month-btn--default' : ''}`}
            onClick={() => onSelect(m)}
          >
            {formatMonth(m)}
            {m === defaultMonth && <span className="csv-month-badge">Suggested</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
