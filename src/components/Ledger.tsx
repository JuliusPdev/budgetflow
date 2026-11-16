import type { MonthPlan } from '../engine/plan';
import type { Cents, Envelope } from '../engine/types';
import { formatDayShort, formatEuros, formatMonthShort } from '../utils/format';

// Two arrangements of the same plan. They only lay numbers out differently —
// every number comes straight from the engine, so switching can't change one.

interface LedgerProps {
  plan: MonthPlan[];
  envelopes: Envelope[];
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

function sumOf(amounts: Record<string, Cents>): Cents {
  return Object.values(amounts).reduce((total, amount) => total + amount, 0);
}

/** Phone layout: one block per month, read top to bottom like a statement. */
export function LedgerRows({ plan, envelopes }: LedgerProps) {
  const nameOf = nameLookup(envelopes);
  const billOf = billLookup(envelopes);

  return (
    <ol className="ledger-rows">
      {plan.map((monthPlan, index) => {
        const bills = Object.entries(monthPlan.billsOut);
        return (
          <li
            key={monthPlan.month}
            className={index === 0 ? 'ledger-row is-current' : 'ledger-row'}
            style={{ animationDelay: `${index * 30}ms` }}
          >
            <div className="ledger-row-head">
              <span className="ledger-month">{formatMonthShort(monthPlan.month)}</span>
              <span className="ledger-amount figures">{formatEuros(monthPlan.totalCents)}</span>
            </div>
            <ul className="ledger-for">
              {Object.entries(monthPlan.byEnvelope).map(([id, cents]) => (
                <li key={id}>
                  <span>{nameOf(id)}</span>
                  <span className="figures">{formatEuros(cents)}</span>
                </li>
              ))}
            </ul>
            {bills.length > 0 && (
              <ul className="ledger-bills" aria-label="Going out">
                {bills.map(([id, cents]) => (
                  <li key={id}>
                    <span>Going out · {billOf(id)}</span>
                    <span className="figures">−{formatEuros(cents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Computer layout: one row per goal, months running left to right. */
export function LedgerColumns({ plan, envelopes }: LedgerProps) {
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
                {formatMonthShort(monthPlan.month)}
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
