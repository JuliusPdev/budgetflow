import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { PastEvent, PastPaycheck } from '../engine/history';
import { pastTimelineRows } from '../engine/history';
import type { MonthPlan } from '../engine/plan';
import { ownerOf } from '../engine/payments';
import { buildColumns } from '../engine/columns';
import { addMonths } from '../engine/months';
import { fillByDeadline, type FilledLine } from '../engine/setAsideProgress';
import { buildTimeline, type DoneMark, type TimelineRow } from '../engine/timeline';
import type { Cents, Day, Envelope, Month } from '../engine/types';
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
  /** Expenses you finished, marked with a ✓ on the day. */
  done?: DoneMark[];
  /** The paychecks before this one, as they really happened, oldest first. */
  past?: PastPaycheck[];
  /** What you've set aside this paycheck so far: fills its lines, closest deadline first. */
  setAsideSoFarCents?: Cents;
  /** When the next paycheck was expected, while you're waiting for it: the current one runs until today. */
  lateSince?: Day;
}

/** "next one due today" / "next one 1 day late" / "next one 3 days late". */
function lateText(days: number): string {
  if (days === 0) return 'next one due today';
  return `next one ${days === 1 ? '1 day' : `${days} days`} late`;
}

/** A finished expense: its name and what it really cost, red like any money going out. */
function DoneLine({ mark }: { mark: DoneMark }) {
  return (
    <span className="tl-body">
      {/* What it cost left your money; "Cost as planned" below already says it's finished. */}
      <span className="tl-head tl-amount-out">
        <span>
          {mark.name}
          <span className="sr-only"> (done)</span>
        </span>
        <span className="figures">−{formatEuros(mark.costCents)}</span>
      </span>
      <span className="tl-sub">{mark.costCents === mark.plannedCents ? 'Cost as planned' : `Planned ${formatEuros(mark.plannedCents)}`}</span>
    </span>
  );
}

/** One of this paycheck's lines: ✓ and green once set aside, "€60 of €150" while filling. */
function FilledLineRow({ line, name }: { line: FilledLine; name: string }) {
  const isFull = line.plannedCents > 0 && line.filledCents >= line.plannedCents;
  const isPart = line.filledCents > 0 && !isFull;
  return (
    <span className={isFull ? 'ledger-for-line is-filled' : 'ledger-for-line'}>
      <span>
        {isFull && <span aria-hidden="true">✓ </span>}
        {name}
        {isFull && <span className="sr-only"> (set aside)</span>}
      </span>
      <span className="figures">
        {isPart ? `${formatEuros(line.filledCents)} of ${formatEuros(line.plannedCents)}` : formatEuros(line.plannedCents)}
      </span>
    </span>
  );
}

/** How much of a column one bill label needs, so labels closer than this go into separate lanes. */
const LABEL_SPAN = 0.55;
/** How far each lane of bill labels sits below the one above it. */
const LANE_REM = 2.5;

/** The day a row belongs to, so a day's date shows once; month lines have none. */
function dayKey(event: TimelineRow['event']): string | null {
  switch (event.kind) {
    case 'month-start':
      return null;
    case 'bill':
      return event.date ?? 'any day';
    case 'done':
      return event.mark.date;
    case 'set-aside':
      return event.expectedOn === undefined ? event.date : 'soon';
    case 'past':
      return event.event.date;
    default:
      return event.date;
  }
}

/** A row's date; under another row of the same day it's only read aloud. */
function DateCell({ label, repeated }: { label: string; repeated: boolean }) {
  return <span className="tl-date">{repeated ? <span className="sr-only">{label}</span> : label}</span>;
}

/** What a past event's line says: its title, the amount, and a note underneath. */
function pastLine(event: PastEvent): { title: string; cents: string; sub: string | null; goesOut: boolean } {
  if (event.kind === 'payment') {
    const spent = event.fromSpendingCents > 0 ? `${formatEuros(event.fromSpendingCents)} from spending money` : null;
    return {
      title: `Paid · ${event.name}`,
      cents: `−${formatEuros(event.fromPotCents)}`,
      // Done's own payment: the ✓ line beside it already says "Done".
      sub: [event.note === 'Done' ? 'Last payment' : event.note, spent].filter((part) => part !== undefined && part !== null).join(' · ') || null,
      goesOut: true,
    };
  }
  if (event.kind === 'withdrawal') return { title: `Took out · ${event.reason}`, cents: `−${formatEuros(event.amountCents)}`, sub: null, goesOut: true };
  if (event.kind === 'correction') {
    const sign = event.amountCents < 0 ? '−' : '+';
    return { title: 'Correction', cents: `${sign}${formatEuros(Math.abs(event.amountCents))}`, sub: null, goesOut: false };
  }
  return { title: '', cents: '', sub: null, goesOut: false };
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
export function LedgerTimeline({ plan, envelopes, payday, currentStart, today, done, past = [], setAsideSoFarCents, lateSince }: LedgerProps) {
  const id = useId();
  const [showPast, setShowPast] = useState(false);
  const nameOf = nameLookup(envelopes);
  const currentRows = buildTimeline(plan, envelopes, payday, today, currentStart, done, lateSince);
  const pastRows = showPast ? pastTimelineRows(past) : [];
  // When the past ends in the month the current paycheck starts in, that month is named once.
  const lastPastMonth = [...pastRows].reverse().find((row) => row.event.kind === 'month-start')?.event;
  const firstCurrent = currentRows[0]?.event;
  const repeatsMonth =
    lastPastMonth?.kind === 'month-start' && firstCurrent?.kind === 'month-start' && lastPastMonth.month === firstCurrent.month;
  const rows: TimelineRow[] = [...pastRows, ...(repeatsMonth ? currentRows.slice(1) : currentRows)];
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
    <>
      {past.length > 0 && (
        <button
          type="button"
          className="button-text tl-earlier"
          aria-expanded={showPast}
          aria-controls={`${id}-timeline`}
          onClick={() => setShowPast(!showPast)}
        >
          {showPast ? 'Hide earlier paychecks' : `Show earlier paychecks (${past.length})`}
        </button>
      )}
    <ol id={`${id}-timeline`} className="timeline">
      {rows.map(({ event }, index) => {
        const band = <span className={bandClass(index)} aria-hidden="true" />;
        // Today heads its day; the rest of that day goes without the date.
        const repeated = index > 0 && dayKey(event) !== null && dayKey(event) === dayKey(rows[index - 1].event);

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
                <DateCell label={formatDayShort(event.date)} repeated={repeated} />
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
                <DateCell label={formatDayShort(event.date)} repeated={repeated} />
                <span className="tl-sub">
                  Last day of this paycheck · {event.daysLeft === 1 ? '1 day' : `${event.daysLeft} days`} left
                </span>
              </span>
            </li>
          );
        }

        if (event.kind === 'set-aside') {
          const dates = formatPeriod(event.paycheck, payday, event.isCurrent ? currentStart : undefined);
          // While the next paycheck is late: the current one runs until today, the next one is "soon".
          const sub =
            event.expectedOn !== undefined
              ? `Expected ${formatDayShort(event.expectedOn)} · not here yet`
              : event.nextLateDays !== undefined && currentStart !== undefined
                ? `Paycheck · ${formatDayShort(currentStart)} – today · ${lateText(event.nextLateDays)}`
                : dates === null
                  ? null
                  : `Paycheck · ${dates}`;
          return (
            <li key={`in-${event.paycheck}`} className="tl-row tl-in">
              <span />
              {band}
              <span className="tl-content">
                <DateCell label={event.expectedOn !== undefined ? 'Soon' : formatDayShort(event.date)} repeated={repeated} />
                <span className="tl-body">
                  <span className="tl-head">
                    <span>
                      Put aside
                      {event.isCurrent && <span className="tl-tag">This paycheck</span>}
                    </span>
                    <span className="figures">{formatEuros(event.amountCents)}</span>
                  </span>
                  {sub !== null && <span className="tl-sub">{sub}</span>}
                  <span className="ledger-for">
                    {event.isCurrent && setAsideSoFarCents !== undefined
                      ? fillByDeadline(event.byEnvelope, envelopes, setAsideSoFarCents).map((line) => (
                          <FilledLineRow key={line.id} line={line} name={nameOf(line.id)} />
                        ))
                      : Object.entries(event.byEnvelope).map(([id, cents]) => (
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

        if (event.kind === 'done') {
          const { mark } = event;
          return (
            <li key={`done-${mark.expenseId}`} className="tl-row tl-done">
              <span />
              {band}
              <span className="tl-content">
                <DateCell label={formatDayShort(mark.date)} repeated={repeated} />
                <DoneLine mark={mark} />
              </span>
            </li>
          );
        }

        if (event.kind === 'past-paycheck') {
          return (
            <li key={`past-${event.paycheck}`} className="tl-row tl-in tl-past">
              <span />
              {band}
              <span className="tl-content">
                <DateCell label={formatDayShort(event.date)} repeated={repeated} />
                <span className="tl-body">
                  <span className="tl-head">
                    <span>{event.putAsideCents > 0 ? 'Put aside' : 'Nothing put aside'}</span>
                    {event.putAsideCents > 0 && <span className="figures">{formatEuros(event.putAsideCents)}</span>}
                  </span>
                  <span className="tl-sub">
                    Paycheck · {formatDayShort(event.date)} – {formatDayShort(event.last)}
                    {event.split !== undefined && ` · planned ${formatEuros(event.split.totalCents)}`}
                  </span>
                  {event.split !== undefined && (
                    <span className="ledger-for">
                      {event.split.lines.map((line) => (
                        <span key={line.id} className="ledger-for-line">
                          <span>{line.name}</span>
                          <span className="figures">{formatEuros(line.cents)}</span>
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </span>
            </li>
          );
        }

        if (event.kind === 'past') {
          const happened = event.event;
          if (happened.kind === 'done') {
            return (
              <li key={`past-done-${happened.mark.expenseId}`} className="tl-row tl-done tl-past">
                <span />
                {band}
                <span className="tl-content">
                  <DateCell label={formatDayShort(happened.date)} repeated={repeated} />
                  <DoneLine mark={happened.mark} />
                </span>
              </li>
            );
          }
          const line = pastLine(happened);
          return (
            <li key={`past-${index}`} className={line.goesOut ? 'tl-row tl-out tl-past' : 'tl-row tl-past'}>
              <span />
              {band}
              <span className="tl-content">
                <DateCell label={formatDayShort(happened.date)} repeated={repeated} />
                <span className="tl-body">
                  <span className="tl-head">
                    <span>{line.title}</span>
                    <span className="figures">{line.cents}</span>
                  </span>
                  {line.sub !== null && <span className="tl-sub">{line.sub}</span>}
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
              <DateCell label={event.date === undefined ? 'Any day' : formatDayShort(event.date)} repeated={repeated} />
              <span className="tl-body">
                <span className="tl-head">
                  <span>{event.isPaid ? `Paid · ${nameOf(event.envelopeId)}` : nameOf(event.envelopeId)}</span>
                  <span className="figures">−{formatEuros(event.amountCents)}</span>
                </span>
              </span>
            </span>
          </li>
        );
      })}
    </ol>
    </>
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
export function LedgerColumns({ plan, envelopes, payday, currentStart, today, done, past = [], lateSince, setAsideSoFarCents }: LedgerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nowRef = useRef<HTMLElement>(null);
  // Opens at "Now": the earlier paychecks wait to the left, a scroll away.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const now = nowRef.current;
    if (scroller === null || now === null || past.length === 0) return;
    const labels = scroller.querySelector<HTMLElement>('.planner-labels');
    scroller.scrollLeft = now.offsetLeft - (labels?.offsetWidth ?? 0);
  }, [past.length]);
  const layout = buildColumns(plan, envelopes, payday, today, currentStart, done);
  if (layout === null) return null;
  const nameOf = nameLookup(envelopes);
  const currentBrick = layout.bricks.find((brick) => brick.isCurrent);
  const filledById =
    currentBrick === undefined || setAsideSoFarCents === undefined
      ? undefined
      : new Map(fillByDeadline(currentBrick.byEnvelope, envelopes, setAsideSoFarCents).map((line) => [line.id, line]));
  // One row per expense: its parts' amounts are added up under its own id.
  const goals = [...envelopes]
    .filter((envelope, index) => envelopes.findIndex((other) => ownerOf(other) === ownerOf(envelope)) === index)
    .map((envelope) => ({ ...envelope, id: ownerOf(envelope) }))
    .filter((envelope) => plan.some((month) => month.byEnvelope[envelope.id] !== undefined))
    .sort((a, b) => (a.dueDate ?? a.dueMonth).localeCompare(b.dueDate ?? b.dueMonth));
  // The first month is named at the left edge only if the next month's line leaves room;
  // otherwise the next month carries the year.
  const firstLine = layout.monthLines[0];
  // With earlier paychecks to the left, a month already named there isn't named again.
  const showFirstMonth =
    (firstLine === undefined || firstLine.brick > 0 || firstLine.at > 0.45) &&
    (past.length === 0 || layout.bricks[0].from.endsWith('-01'));

  return (
    // Long plans are wider than the screen; only the planner scrolls, never the page.
    <div ref={scrollRef} className="ledger-scroll" role="region" aria-label="Plan by paycheck" tabIndex={0}>
      <div
        // A ✓ for something finished needs a line of its own under the bills.
        className={layout.done.length > 0 ? 'planner planner--with-done' : 'planner'}
        style={{
          gridTemplateColumns: `var(--planner-labels) repeat(${past.length + layout.bricks.length}, minmax(9rem, 1fr))`,
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

        {past.map((paycheck, index) => (
          <PastBrick key={paycheck.paycheck} paycheck={paycheck} goals={goals.length} isFirst={index === 0} />
        ))}

        {layout.bricks.map((brick, index) => {
          // While the next paycheck is late, the current one runs until today.
          const runsToToday = brick.isCurrent && currentStart !== undefined && lateSince !== undefined && today >= lateSince;
          const dates = runsToToday
            ? `${formatDayShort(currentStart)} – today`
            : formatPeriod(brick.paycheck, payday, brick.isCurrent ? currentStart : undefined);
          const lines = layout.monthLines.filter((line) => line.brick === index);
          // Each bill's stretch inside this brick: a dot for one day, a bar for "any day".
          const bills = layout.bills.flatMap((bill) => {
            if (index < bill.start.brick || index > bill.end.brick) return [];
            const from = index === bill.start.brick ? bill.start.at : 0;
            const to = index === bill.end.brick ? bill.end.at : 1;
            return [{ bill, from, to, isFirst: index === bill.start.brick }];
          });
          // Labels closer than about half a column would overlap: each one too close to the last in its lane moves down a lane.
          const laneEnds: number[] = [];
          const laneOf = new Map<(typeof bills)[number], number>();
          for (const item of [...bills].filter((candidate) => candidate.isFirst).sort((a, b) => a.from - b.from)) {
            let lane = laneEnds.findIndex((lastFrom) => item.from - lastFrom >= LABEL_SPAN);
            if (lane === -1) lane = laneEnds.length;
            laneEnds[lane] = item.from;
            laneOf.set(item, lane);
          }
          const label = dates === null ? formatMonthLong(brick.paycheck) : `Paycheck ${dates}`;

          return (
            <section
              key={brick.paycheck}
              ref={brick.isCurrent ? nowRef : undefined}
              className={brick.isCurrent ? 'planner-brick is-current' : 'planner-brick'}
              aria-label={label}
            >
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
                // This paycheck only: what you've set aside fills its lines, closest deadline first, like the timeline.
                const filled = brick.isCurrent ? filledById?.get(envelope.id) : undefined;
                const isFull = filled !== undefined && filled.plannedCents > 0 && filled.filledCents >= filled.plannedCents;
                const isPart = filled !== undefined && filled.filledCents > 0 && !isFull;
                return (
                  <span key={envelope.id} className={isFull ? 'pl-cell pl-goal figures is-filled' : 'pl-cell pl-goal figures'}>
                    {cents !== undefined && (
                      <>
                        <span className="sr-only">{envelope.name}: </span>
                        {isFull && <span aria-hidden="true">✓ </span>}
                        {isPart ? `${formatEuros(filled.filledCents)} of ${formatEuros(cents)}` : formatEuros(cents)}
                        {isFull && <span className="sr-only"> (set aside)</span>}
                      </>
                    )}
                  </span>
                );
              })}
              <span className="pl-cell pl-total figures">
                <span className="sr-only">Put aside: </span>
                {formatEuros(brick.totalCents)}
              </span>
              <span className="pl-cell pl-out" style={laneEnds.length > 1 ? { minHeight: `${3.75 + (laneEnds.length - 1) * LANE_REM}rem` } : undefined}>
                {bills.map((item) => {
                  const { bill, from, to, isFirst } = item;
                  const lane = laneOf.get(item) ?? 0;
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
                        <span className="pl-bill-label" style={{ left: percent(from), top: `calc(20px + ${lane * LANE_REM}rem)` }}>
                          <span className="figures">−{formatEuros(bill.amountCents)}</span>
                          <span className="pl-bill-names">
                            {[...new Set(bill.envelopeIds.map(nameOf))].join(', ')} · {when}
                          </span>
                        </span>
                      )}
                    </span>
                  );
                })}
                {layout.done
                  .filter(({ spot }) => spot.brick === index)
                  .map(({ mark, spot }) => (
                    <span key={`done-${mark.expenseId}`} className="pl-done" style={{ left: percent(spot.at) }}>
                      ✓ {mark.name} · {formatEuros(mark.costCents)}
                    </span>
                  ))}
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

/** A spot inside a past paycheck, from 0 (its first day) to 1 (the next one's). */
function spotIn(paycheck: PastPaycheck, day: Day): number {
  const toTime = (value: Day) => Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)));
  return (toTime(day) - toTime(paycheck.from)) / (toTime(paycheck.next) - toTime(paycheck.from));
}

/**
 * A paycheck before the current one, in the Columns view: what you really put
 * aside and what happened. How the set-asides were split wasn't saved, so the
 * expense rows stay empty.
 */
function PastBrick({ paycheck, goals, isFirst }: { paycheck: PastPaycheck; goals: number; isFirst: boolean }) {
  const dates = `${formatDayShort(paycheck.from)} – ${formatDayShort(paycheck.last)}`;
  // Months that begin inside this paycheck get a line and their name.
  const lines: { month: Month; at: number }[] = [];
  for (let month = paycheck.from.slice(0, 7); `${month}-01` < paycheck.next; month = addMonths(month, 1)) {
    // A month starting on the paycheck's first day is named at its left edge, unless the first column names it already.
    if (`${month}-01` > paycheck.from || (`${month}-01` === paycheck.from && !isFirst)) {
      lines.push({ month, at: spotIn(paycheck, `${month}-01`) });
    }
  }

  return (
    <section className="planner-brick is-past" aria-label={`Earlier paycheck ${dates}`}>
      <span className="pl-cell pl-months" aria-hidden="true">
        {isFirst && (
          <span className="pl-month-name" style={{ left: 0 }}>
            {plannerMonth(paycheck.from.slice(0, 7), true)}
          </span>
        )}
        {lines.map((line) => (
          <span key={line.month} className="pl-month-name" style={{ left: percent(line.at) }}>
            {plannerMonth(line.month, false)}
          </span>
        ))}
      </span>
      <span className="pl-cell pl-head">
        <span className="pl-band" aria-hidden="true" />
        <span className="pl-head-text">{dates}</span>
      </span>
      {Array.from({ length: goals }, (_, index) => (
        <span key={index} className="pl-cell pl-goal" />
      ))}
      <span className="pl-cell pl-total figures">
        <span className="sr-only">Put aside: </span>
        {formatEuros(paycheck.putAsideCents)}
      </span>
      <span className="pl-cell pl-out pl-past-events">
        {paycheck.events.map((event, index) =>
          event.kind === 'done' ? (
            <span key={index} className="pl-past-event pl-past-event--done">
              ✓ {event.mark.name} · {formatEuros(event.mark.costCents)}
            </span>
          ) : (
            <span key={index} className="pl-past-event">
              <span className="figures">{pastLine(event).cents}</span> {pastLine(event).title.replace(/^Paid · /, '')} · {formatDayShort(event.date)}
            </span>
          ),
        )}
      </span>
      <span className="pl-cell pl-foot" aria-hidden="true" />
      {lines.map((line) => (
        <span key={line.month} className="pl-month-line" style={{ left: percent(line.at) }} aria-hidden="true" />
      ))}
    </section>
  );
}

