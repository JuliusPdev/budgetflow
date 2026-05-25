import { formatMonth } from '../utils/formatting';
import type { Month } from '../engine/types';

interface Props {
  simulatedMonth: Month;
  realMonth:      Month;
  onNext:         () => void;
  onPrev:         () => void;
  onReset:        () => void;
}

export default function DevToolbar({
  simulatedMonth,
  realMonth,
  onNext,
  onPrev,
  onReset,
}: Props) {
  const isSimulating = simulatedMonth !== realMonth;

  return (
    <div className={`dev-toolbar ${isSimulating ? 'dev-toolbar--active' : ''}`}>
      <div className="dev-toolbar-inner">
        <span className="dev-toolbar-label">
          {isSimulating ? '⚠ Simulating:' : 'Dev:'}
        </span>
        <span className="dev-toolbar-month">{formatMonth(simulatedMonth)}</span>
        <div className="dev-toolbar-actions">
          <button className="dev-toolbar-btn" onClick={onPrev}>← Prev</button>
          <button className="dev-toolbar-btn" data-testid="dev-next-month" onClick={onNext}>Next →</button>
          {isSimulating && (
            <button
              className="dev-toolbar-btn dev-toolbar-btn--reset"
              data-testid="dev-reset"
              onClick={onReset}
            >
              Reset to {formatMonth(realMonth)}
            </button>
          )}
        </div>
        {isSimulating && (
          <span className="dev-toolbar-warning">
            Real month: {formatMonth(realMonth)}
          </span>
        )}
      </div>
    </div>
  );
}
