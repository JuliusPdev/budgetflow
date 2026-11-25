import type { FillUpDone, FillUpRow, FillUpView } from '../engine/fillUp';
import type { Cents } from '../engine/types';
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
  /** In the lanes view: amounts above the dots, the bill below, and the paycheck you're in tinted. */
  labelled?: boolean;
}

/** The paycheck you're living on, as a soft band behind a lane. */
function NowBand({ view }: { view: FillUpView }) {
  const now = view.paycheckSpans.find((span) => span.isCurrent);
  return now === undefined ? null : <span className="fu-now" style={{ left: percent(now.x), width: percent(now.width) }} />;
}

/**
 * One expense's way to its due day: a dot per paycheck that puts money
 * towards it, dark green for what's already in the pot, terracotta for when
 * it's due. Month lines and today sit behind it.
 */
export function FillUpBar({ row, view, currentDone, labelled = false }: FillUpBarProps) {
  const when =
    row.due.date === undefined ? `any day in ${monthName(row.due.month, false)}` : formatDayShort(row.due.date);
  return (
    // Scrolls sideways together with every other bar and the months above.
    <span className="fu-scroll">
      <span className={labelled ? 'fu-bar fu-bar--labelled' : 'fu-bar'}>
        <span className="sr-only">
          {formatEuros(row.inPotCents)} of {formatEuros(row.targetCents)} in the pot, due {when}.
        </span>
        <span aria-hidden="true">
          {labelled && <NowBand view={view} />}
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
          {labelled &&
            row.dots.map((dot) => (
              <span key={`label-${dot.x}`} className="fu-dot-label" style={{ left: percent(dot.x) }}>
                {formatEuros(dot.cents)}
              </span>
            ))}
          {labelled && (
            <span className="fu-due-label" style={{ left: percent(row.due.from) }}>
              −{formatEuros(row.targetCents)} · {when}
            </span>
          )}
        </span>
      </span>
    </span>
  );
}

/** A finished expense's lane: what it cost, on the day it was done. */
export function FillUpDoneBar({ done, view }: { done: FillUpDone; view: FillUpView }) {
  return (
    <span className="fu-scroll">
      <span className="fu-bar fu-bar--labelled">
        <span className="sr-only">
          Done on {formatDayShort(done.date)}, cost {formatEuros(done.costCents)}.
        </span>
        <span aria-hidden="true">
          <NowBand view={view} />
          {view.monthLines.map((line) => (
            <span key={line.month} className="fu-line" style={{ left: percent(line.x) }} />
          ))}
          <span className="fu-today" style={{ left: percent(view.today) }} />
          <span className="fu-due-label fu-due-label--done" style={{ left: percent(done.x) }}>
            −{formatEuros(done.costCents)} · {formatDayShort(done.date)}
          </span>
        </span>
      </span>
    </span>
  );
}

interface LanesHeaderProps {
  view: FillUpView;
  /** What you've set aside this paycheck so far, and what's still to go. */
  setAsideSoFarCents: Cents;
  openCents: Cents;
}

/**
 * Above the lanes: each paycheck with its dates (the one you're in marked
 * "Now"), what it asks you to put aside, and room for what's free to spend.
 */
export function LanesHeader({ view, setAsideSoFarCents, openCents }: LanesHeaderProps) {
  return (
    <>
      <div className="expense-axis lanes-row">
        <span className="lanes-label" />
        <span className="fu-scroll">
          <span className="fu-bar lanes-cells lanes-cells--paychecks">
            {view.paycheckSpans.map((span) => (
              <span key={span.from} className={span.isCurrent ? 'lanes-cell is-now' : 'lanes-cell'} style={{ left: percent(span.x), width: percent(span.width) }}>
                <span className="lanes-paycheck-bar" aria-hidden="true" />
                <span className="lanes-dates">
                  {formatDayShort(span.from)} – {formatDayShort(span.last)}
                  {span.isCurrent && <b className="lanes-now"> Now</b>}
                </span>
              </span>
            ))}
          </span>
        </span>
      </div>
      <div className="expense-axis lanes-row">
        <span className="lanes-label lanes-label--in">Put aside</span>
        <span className="fu-scroll">
          <span className="fu-bar lanes-cells lanes-cells--amounts">
            {view.paycheckSpans.map((span) => (
              <span key={span.from} className={span.isCurrent ? 'lanes-cell is-now' : 'lanes-cell'} style={{ left: percent(span.x), width: percent(span.width) }}>
                <span className={span.putAsideCents > 0 ? 'lanes-amount' : 'lanes-amount is-empty'}>{formatEuros(span.putAsideCents)}</span>
                {span.isCurrent && span.putAsideCents > 0 && (
                  <>
                    <span className="lanes-progress" aria-hidden="true">
                      <span style={{ width: percent(Math.min(1, setAsideSoFarCents / span.putAsideCents)) }} />
                    </span>
                    <span className="lanes-progress-text">
                      {openCents > 0
                        ? `${formatEuros(setAsideSoFarCents)} set aside · ${formatEuros(openCents)} to go`
                        : 'Done for this paycheck'}
                    </span>
                  </>
                )}
              </span>
            ))}
          </span>
        </span>
      </div>
      <div className="expense-axis lanes-row lanes-row--last">
        <span className="lanes-label lanes-label--quiet">Free to spend</span>
        <span className="fu-scroll">
          <span className="fu-bar lanes-cells">
            {view.paycheckSpans.map((span) => (
              <span key={span.from} className={span.isCurrent ? 'lanes-cell is-now' : 'lanes-cell'} style={{ left: percent(span.x), width: percent(span.width) }}>
                <span className="lanes-later">— later</span>
              </span>
            ))}
          </span>
        </span>
      </div>
    </>
  );
}

/** Below the lanes: what leaves the pot in each paycheck. Its scrollbar moves them all. */
export function LanesFooter({ view }: { view: FillUpView }) {
  return (
    <div className="expense-axis lanes-row lanes-row--footer">
      <span className="lanes-label lanes-label--out">Going out</span>
      <span className="fu-scroll fu-scroll--axis" tabIndex={0} aria-label="Paychecks; scroll sideways to see later ones">
        <span className="fu-bar lanes-cells">
          {view.paycheckSpans.map((span) => (
            <span key={span.from} className={span.isCurrent ? 'lanes-cell is-now' : 'lanes-cell'} style={{ left: percent(span.x), width: percent(span.width) }}>
              {span.goingOutCents > 0 ? <span className="lanes-amount lanes-amount--out">−{formatEuros(span.goingOutCents)}</span> : <span className="lanes-later">—</span>}
            </span>
          ))}
        </span>
      </span>
    </div>
  );
}
