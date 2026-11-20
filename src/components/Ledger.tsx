import type { MonthPlan } from '../engine/plan';
import type { Cents, Envelope } from '../engine/types';
import { buildTimeline } from '../engine/timeline';
import { periodMonth } from '../engine/timing';
import type { Day, Month } from '../engine/types';
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
}

function nameLookup(envelopes: Envelope[]): (id: string) => string {
  const names = new Map(envelopes.map((envelope) => [envelope.id, envelope.name]));
  return (id) => names.get(id) ?? id;
}

/** A bill's name with its real date when known: "Presents · 5 Dec". */
function billLookup(envelopes: Envelope[]): (id: string) => string {
  const byId = new Map(envelopes.map((envelope) => [envelope.id, envelope]));
  return (id) => {
    const envelope = byId.get(id);
    if (envelope === undefined) return id;
    return envelope.dueDate === undefined ? envelope.name : `${envelope.name} · ${formatDayShort(envelope.dueDate)}`;
  };
}

/** A period's name: the month it mostly covers, big, with its payday-to-payday dates small underneath. */
function PeriodName({ month, payday, realStart }: { month: Month; payday: number; realStart?: Day }) {
  const dates = formatPeriod(month, payday, realStart);
  return (
    <span className="period-name">
      <span className="period-month">{formatMonthShort(periodMonth(month, payday))}</span>
      {dates !== null && <span className="period-dates">{dates}</span>}
    </span>
  );
}

function sumOf(amounts: Record<string, Cents>): Cents {
  return Object.values(amounts).reduce((total, amount) => total + amount, 0);
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
export function LedgerTimeline({ plan, envelopes, payday, currentStart, today }: LedgerProps & { today: Day }) {
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

/** Computer layout: one row per goal, months running left to right. */
export function LedgerColumns({ plan, envelopes, payday, currentStart }: LedgerProps) {
  const billOf = billLookup(envelopes);
  const goals = [...envelopes]
    .filter((envelope) => plan.some((month) => month.byEnvelope[envelope.id] !== undefined))
    .sort((a, b) => a.dueMonth.localeCompare(b.dueMonth));

  function cellClass(index: number, extra = ''): string {
    return [index === 0 ? 'is-current' : '', extra].filter(Boolean).join(' ');
  }

  return (
    // Wide plans can be wider than the screen; only the table scrolls, never the page.
    <div className="ledger-scroll" role="region" aria-label="Ledger by month" tabIndex={0}>
      <table className="ledger-table">
        <caption className="sr-only">Amount to put aside each month, per goal</caption>
        <thead>
          <tr>
            <th scope="col" className="ledger-goal-col">
              Goal
            </th>
            {plan.map((monthPlan, index) => (
              <th key={monthPlan.month} scope="col" className={cellClass(index)}>
                <PeriodName month={monthPlan.month} payday={payday} realStart={index === 0 ? currentStart : undefined} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {goals.map((envelope) => (
            <tr key={envelope.id}>
              <th scope="row" className="ledger-goal-col">
                {envelope.name}
              </th>
              {plan.map((monthPlan, index) => {
                const cents = monthPlan.byEnvelope[envelope.id];
                return (
                  <td key={monthPlan.month} className={cellClass(index, 'figures')}>
                    {cents === undefined ? <span className="empty">·</span> : formatEuros(cents)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="ledger-total">
            <th scope="row" className="ledger-goal-col">
              Put aside
            </th>
            {plan.map((monthPlan, index) => (
              <td key={monthPlan.month} className={cellClass(index, 'figures')}>
                {formatEuros(monthPlan.totalCents)}
              </td>
            ))}
          </tr>
          <tr className="ledger-going-out">
            <th scope="row" className="ledger-goal-col">
              Going out
            </th>
            {plan.map((monthPlan, index) => {
              const bills = Object.keys(monthPlan.billsOut);
              return (
                <td key={monthPlan.month} className={cellClass(index, 'figures')}>
                  {bills.length === 0 ? (
                    <span className="empty">·</span>
                  ) : (
                    <>
                      −{formatEuros(sumOf(monthPlan.billsOut))}
                      <span className="bill-names">{bills.map(billOf).join(', ')}</span>
                    </>
                  )}
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
