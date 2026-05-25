import { useEffect, useState } from 'react';
import { addDays } from '../../utils/importStorage';

interface Props {
  periodStart: string;
  periodEnd: string;
  rowCount: number;
  overlapCount: number;
  lastSettleEnd: string | undefined;
  defaultStart: string;
  onPeriodChange: (start: string, end: string) => void;
}

export default function ImportDateRangeStep({
  periodStart,
  periodEnd,
  rowCount,
  overlapCount,
  lastSettleEnd,
  defaultStart,
  onPeriodChange,
}: Props) {
  const [start, setStart] = useState(periodStart);
  const [end, setEnd] = useState(periodEnd);
  const overlaps = lastSettleEnd && start < addDays(lastSettleEnd, 1);

  useEffect(() => {
    setStart(periodStart);
    setEnd(periodEnd);
  }, [periodStart, periodEnd]);

  function changeStart(next: string) {
    setStart(next);
    onPeriodChange(next, end);
  }

  function changeEnd(next: string) {
    setEnd(next);
    onPeriodChange(start, next);
  }

  return (
    <section className="csv-settle-period" aria-labelledby="csv-settle-period-title">
      <h3 id="csv-settle-period-title" className="csv-wizard-step-label">
        Settle period — pick From / Through
      </h3>
      <p className="csv-step-intro">
        Settle a period using booking dates from your bank export. Each line updates the calendar month it belongs to.
      </p>
      {lastSettleEnd && (
        <p className="csv-hint">
          Last settle through <strong>{lastSettleEnd}</strong>.
          {overlaps && overlapCount > 0 && (
            <> This range overlaps — <strong>{overlapCount}</strong> lines will be recognized as already settled.</>
          )}
          {!overlaps && (
            <> Continuing from <strong>{defaultStart}</strong> (day after).</>
          )}
        </p>
      )}
      <div className="csv-period-fields">
        <label className="csv-field-label" htmlFor="csv-period-start">From</label>
        <input
          id="csv-period-start"
          type="date"
          className="csv-select csv-select--date"
          value={start}
          onChange={e => changeStart(e.target.value)}
        />
        <label className="csv-field-label" htmlFor="csv-period-end">Through</label>
        <input
          id="csv-period-end"
          type="date"
          className="csv-select csv-select--date"
          value={end}
          onChange={e => changeEnd(e.target.value)}
        />
      </div>
      <p className="csv-hint">{rowCount} transactions in this period</p>
    </section>
  );
}
