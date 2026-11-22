import type { MonthPlan } from '../engine/plan';
import { ownerOf } from '../engine/payments';
import { buildColumns } from '../engine/columns';
import { buildTimeline } from '../engine/timeline';
import type { Day, Envelope, Month } from '../engine/types';
import { formatDayShort, formatEuros, formatMonthLong, formatMonthShort, formatPeriod } from '../utils/format';

// Two arrangements of the same plan. They only lay numbers out differently —
// every number comes straight from the engine, so switching can't change one.

interface LedgerProps {
  plan: MonthPlan[];
  envelopes: Envelope[];
  /** Day of the month pay arrives: names each period by its real dates. */
  payday: number;
  /** When the current period really started, if you recorded its paycheck. */
  currentStart?: Day;
  /** Today: where the "Today" line goes. */
  today: Day;
}

function nameLookup(envelopes: Envelope[]): (id: string) => string {
  // Parts of an expense with payments go by the expense's name too.
  const names = new Map(envelopes.flatMap((envelope) => [[envelope.id, envelope.name], [ownerOf(envelope), envelope.name]] as const));
  return (id) => names.get(id) ?? id;
}

/** "Nov" in the margin, with the year small underneath on the first month and at each new year. */
function GutterLabel({ month, isFirst }: { month: Month; isFirst: boolean }) {
  const [name, year] = formatMonthShort(month).split(' ');
  return (
    <>
      {name}
      {(isFirst || month.endsWith('-01')) && <span className="tl-year">{year}</span>}
    </>
  );
}

/**
 * The plan as a diary, read top to bottom: events on their real days, month
 * names in the left margin where each month begins, and a band per paycheck
 * beside them. The band of the paycheck you're living on is green.
 */
export function LedgerTimeline({ plan, envelopes, payday, currentStart, today }: LedgerProps) {
  const nameOf = nameLookup(envelopes);
  const rows = buildTimeline(plan, envelopes, payday, today, currentStart);
  const currentBand = plan[0]?.month;

  /** A band's look in this row: whether it starts or ends here, and if it's the current one. */
  function bandClass(index: number): string {
    const { band } = rows[index];
    if (band === undefined) return 'tl-band-cell';
    return [
      'tl-band-cell tl-band',
      band === currentBand ? 'is-current' : '',
      rows[index - 1]?.band !== band ? 'is-start' : '',
      rows[index + 1]?.band !== band ? 'is-end' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  return (
    <ol className="timeline">
      {rows.map(({ event }, index) => {
        const band = <span className={bandClass(index)} aria-hidden="true" />;

        if (event.kind === 'month-start') {
          return (
            <li key={`month-${event.month}`} className="tl-row tl-month-row">
              <h3 className="tl-month">
                <span className="sr-only">{formatMonthLong(event.month)}</span>
                <span aria-hidden="true">
                  <GutterLabel month={event.month} isFirst={index === 0} />
                </span>
              </h3>
              {band}
              <span className="tl-month-line" />
            </li>
          );
        }

        if (event.kind === 'today') {
          return (
            <li key="today" className="tl-row tl-today">
              <span />
              {band}
              <span className="tl-content">
                <span className="tl-date">{formatDayShort(event.date)}</span>
                <span className="tl-today-label">Today</span>
              </span>
            </li>
          );
        }

        if (event.kind === 'paycheck-end') {
          return (
            <li key="paycheck-end" className="tl-row tl-end">
              <span />
              {band}
              <span className="tl-content">
                <span className="tl-date">{formatDayShort(event.date)}</span>
                <span className="tl-sub">
                  Last day of this paycheck · {event.daysLeft === 1 ? '1 day' : `${event.daysLeft} days`} left
                </span>
              </span>
            </li>
          );
        }

        if (event.kind === 'set-aside') {
          const dates = formatPeriod(event.paycheck, payday, event.isCurrent ? currentStart : undefined);
          return (
            <li key={`in-${event.paycheck}`} className="tl-row tl-in">
              <span />
              {band}
              <span className="tl-content">
                <span className="tl-date">{formatDayShort(event.date)}</span>
                <span className="tl-body">
                  <span className="tl-head">
                    <span>
                      Put aside
                      {event.isCurrent && <span className="tl-tag">This paycheck</span>}
                    </span>
                    <span className="figures">{formatEuros(event.amountCents)}</span>
                  </span>
                  {dates !== null && <span className="tl-sub">Paycheck · {dates}</span>}
                  <span className="ledger-for">
                    {Object.entries(event.byEnvelope).map(([id, cents]) => (
                      <span key={id} className="ledger-for-line">
                        <span>{nameOf(id)}</span>
                        <span className="figures">{formatEuros(cents)}</span>
                      </span>
                    ))}
                  </span>
                </span>
              </span>
            </li>
          );
        }

        return (
          <li key={`out-${event.envelopeId}`} className="tl-row tl-out">
            <span />
            {band}
            <span className="tl-content">
              <span className="tl-date">{event.date === undefined ? 'Any day' : formatDayShort(event.date)}</span>
              <span className="tl-body">
                <span className="tl-head">
                  <span>{nameOf(event.envelopeId)}</span>
                  <span className="figures">−{formatEuros(event.amountCents)}</span>
                </span>
                {event.isPaid && <span className="tl-sub">Already paid · being put back</span>}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** "Nov", with the year for the first month and for January: "Jan 2027". */
function plannerMonth(month: Month, isFirst: boolean): string {
  return isFirst || month.endsWith('-01') ? formatMonthShort(month) : formatMonthShort(month).split(' ')[0];
}

/** A spot inside a brick as a CSS position: 0.35 → "35%". */
function percent(at: number): string {
  return `${(at * 100).toFixed(2)}%`;
}

/**
 * Wide layout, like a wall planner: one equally wide column per paycheck.
 * Money is put aside at its left edge (payday); dashed lines show where a month
 * begins; bills sit on their real day in the "Going out" row.
 */
export function LedgerColumns({ plan, envelopes, payday, currentStart, today }: LedgerProps) {
  const layout = buildColumns(plan, envelopes, payday, today, currentStart);
  if (layout === null) return null;
  const nameOf = nameLookup(envelopes);
  // One row per expense: its parts' amounts are added up under its own id.
  const goals = [...envelopes]
    .filter((envelope, index) => envelopes.findIndex((other) => ownerOf(other) === ownerOf(envelope)) === index)
    .map((envelope) => ({ ...envelope, id: ownerOf(envelope) }))
    .filter((envelope) => plan.some((month) => month.byEnvelope[envelope.id] !== undefined))
    .sort((a, b) => (a.dueDate ?? a.dueMonth).localeCompare(b.dueDate ?? b.dueMonth));
  // The first month is named at the left edge only if the next month's line leaves room;
  // otherwise the next month carries the year.
  const firstLine = layout.monthLines[0];
  const showFirstMonth = firstLine === undefined || firstLine.brick > 0 || firstLine.at > 0.45;

  return (
    // Long plans are wider than the screen; only the planner scrolls, never the page.
    <div className="ledger-scroll" role="region" aria-label="Plan by paycheck" tabIndex={0}>
      <div
        className="planner"
        style={{
          gridTemplateColumns: `var(--planner-labels) repeat(${layout.bricks.length}, minmax(9rem, 1fr))`,
          // Month names, dates, one row per expense, put aside, going out, today.
          gridTemplateRows: `repeat(${goals.length + 5}, auto)`,
        }}
      >
        <div className="planner-labels" aria-hidden="true">
          <span className="pl-cell pl-months" />
          <span className="pl-cell pl-head" />
          {goals.map((envelope) => (
            <span key={envelope.id} className="pl-cell pl-goal">
              {envelope.name}
            </span>
          ))}
          <span className="pl-cell pl-total">Put aside</span>
          <span className="pl-cell pl-out">Going out</span>
          <span className="pl-cell pl-foot" />
        </div>

        {layout.bricks.map((brick, index) => {
          const dates = formatPeriod(brick.paycheck, payday, brick.isCurrent ? currentStart : undefined);
          const lines = layout.monthLines.filter((line) => line.brick === index);
          // Each bill's stretch inside this brick: a dot for one day, a bar for "any day".
          const bills = layout.bills.flatMap((bill) => {
            if (index < bill.start.brick || index > bill.end.brick) return [];
            const from = index === bill.start.brick ? bill.start.at : 0;
            const to = index === bill.end.brick ? bill.end.at : 1;
            return [{ bill, from, to, isFirst: index === bill.start.brick }];
          });
          const label = dates === null ? formatMonthLong(brick.paycheck) : `Paycheck ${dates}`;

          return (
            <section key={brick.paycheck} className={brick.isCurrent ? 'planner-brick is-current' : 'planner-brick'} aria-label={label}>
              <span className="pl-cell pl-months" aria-hidden="true">
                {index === 0 && showFirstMonth && (
                  <span className="pl-month-name" style={{ left: 0 }}>
                    {plannerMonth(layout.firstMonth, true)}
                  </span>
                )}
                {lines.map((line) => (
                  <span key={line.month} className="pl-month-name" style={{ left: percent(line.at) }}>
                    {plannerMonth(line.month, !showFirstMonth && line === firstLine)}
                  </span>
                ))}
              </span>
              <span className="pl-cell pl-head">
                {/* The paycheck as a band, like in the timeline: green while you live on it. */}
                <span className="pl-band" aria-hidden="true" />
                <span className="pl-head-text">
                  {dates ?? formatMonthShort(brick.paycheck)}
                  {brick.isCurrent && <span className="pl-now">Now</span>}
                </span>
              </span>
              {goals.map((envelope) => {
                const cents = brick.byEnvelope[envelope.id];
                return (
                  <span key={envelope.id} className="pl-cell pl-goal figures">
                    {cents !== undefined && (
                      <>
                        <span className="sr-only">{envelope.name}: </span>
                        {formatEuros(cents)}
                      </>
                    )}
                  </span>
                );
              })}
              <span className="pl-cell pl-total figures">
                <span className="sr-only">Put aside: </span>
                {formatEuros(brick.totalCents)}
              </span>
              <span className="pl-cell pl-out">
                {bills.map(({ bill, from, to, isFirst }) => {
                  const key = `${bill.date ?? bill.month}-${bill.envelopeIds.join('+')}`;
                  const when = bill.date === undefined ? 'any day' : formatDayShort(bill.date);
                  return (
                    <span key={key}>
                      {bill.date === undefined ? (
                        <span className="pl-bill-bar" style={{ left: percent(from), width: percent(to - from) }} />
                      ) : (
                        <span className="pl-bill-dot" style={{ left: percent(from) }} />
                      )}
                      {isFirst && (
                        <span className="pl-bill-label" style={{ left: percent(from) }}>
                          <span className="figures">−{formatEuros(bill.amountCents)}</span>
                          <span className="pl-bill-names">
                            {bill.envelopeIds.map(nameOf).join(', ')} · {when}
                          </span>
                        </span>
                      )}
                    </span>
                  );
                })}
              </span>
              <span className="pl-cell pl-foot" aria-hidden="true">
                {layout.today.brick === index && (
                  <span className="pl-today-label" style={{ left: percent(layout.today.at) }}>
                    Today
                  </span>
                )}
              </span>

              {/* Lines over the whole brick, below the month names. */}
              {lines.map((line) => (
                <span key={line.month} className="pl-month-line" style={{ left: percent(line.at) }} aria-hidden="true" />
              ))}
              {layout.today.brick === index && (
                <span className="pl-today-line" style={{ left: percent(layout.today.at) }} aria-hidden="true" />
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
