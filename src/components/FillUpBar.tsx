import type { FillUpRow, FillUpView } from '../engine/fillUp';
import { formatDayShort, formatEuros, formatMonthShort } from '../utils/format';

// The pieces of the expense list's time axis. Every bar uses one ruler from 0
// (the start of the current paycheck) to 1 (the end of the last one planned),
// so all rows line up with each other and with the Columns view.

/** A position on the ruler (0–1) as a CSS position. */
function percent(x: number): string {
  return `${(x * 100).toFixed(2)}%`;
}

function monthName(month: string, withYear: boolean): string {
  return withYear ? formatMonthShort(month) : formatMonthShort(month).split(' ')[0];
}

/** The month names, once, above the list. */
export function FillUpAxis({ view }: { view: FillUpView }) {
  return (
    // The one visible scrollbar: it moves every bar in the list along with it.
    <span className="fu-scroll fu-scroll--axis" tabIndex={0} aria-label="Months; scroll sideways to see later ones">
      <span className="fu-axis" aria-hidden="true">
        {view.monthLines.map((line, index) => (
          <span key={line.month} className="fu-month" style={{ left: percent(line.x) }}>
            {monthName(line.month, index === 0 || line.month.endsWith('-01'))}
          </span>
        ))}
      </span>
    </span>
  );
}

interface FillUpBarProps {
  row: FillUpRow;
  view: FillUpView;
  /** This paycheck's money is already set aside: its dot is filled. */
  currentDone: boolean;
}

/**
 * One expense's way to its due day: a dot per paycheck that puts money
 * towards it, dark green for what's already in the pot, terracotta for when
 * it's due. Month lines and today sit behind it.
 */
export function FillUpBar({ row, view, currentDone }: FillUpBarProps) {
  const when =
    row.due.date === undefined ? `any day in ${monthName(row.due.month, false)}` : formatDayShort(row.due.date);
  return (
    // Scrolls sideways together with every other bar and the months above.
    <span className="fu-scroll">
      <span className="fu-bar">
        <span className="sr-only">
          {formatEuros(row.inPotCents)} of {formatEuros(row.targetCents)} in the pot, due {when}.
        </span>
        <span aria-hidden="true">
          {view.monthLines.map((line) => (
            <span key={line.month} className="fu-line" style={{ left: percent(line.x) }} />
          ))}
          <span className="fu-today" style={{ left: percent(view.today) }} />
          <span
            className="fu-track"
            style={{
              left: percent(row.start),
              width: percent(row.end - row.start),
            }}
          />
          {row.filledTo > row.start && (
            <span
              className="fu-filled"
              style={{
                left: percent(row.start),
                width: percent(row.filledTo - row.start),
              }}
            />
          )}
          {row.due.date === undefined ? (
            <span
              className="fu-due-month"
              style={{
                left: percent(row.due.from),
                width: percent(row.due.to - row.due.from),
              }}
            />
          ) : (
            <span className="fu-due-day" style={{ left: percent(row.due.from) }} />
          )}
          {row.dots.map((dot) => (
            <span
              key={dot.x}
              className={dot.isCurrent && currentDone ? 'fu-dot is-done' : 'fu-dot'}
              style={{ left: percent(dot.x) }}
              title={formatEuros(dot.cents)}
            />
          ))}
        </span>
      </span>
    </span>
  );
}
