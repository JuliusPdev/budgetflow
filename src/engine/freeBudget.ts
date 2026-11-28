import { addMonths } from './months';
import { paychecksIn } from './paychecks';
import type { MonthPlan } from './plan';
import { fundingMonth } from './timing';
import type { Cents, Expense, FixedCost, LogEntry, Month } from './types';

// What each coming paycheck has to carry, and what's left of it: a forecast.
// The load is what goes into the pot, your fixed costs, and expenses paid
// straight from that paycheck. What's free is your pay minus that load, once
// your pay is known: what really arrived, or else your usual pay.

/** An expense paid straight from one paycheck. */
export interface FromPayItem {
  id: string;
  name: string;
  cents: Cents;
}

export interface FreeBudgetRow {
  /** The paycheck key: the month of its payday. */
  paycheck: Month;
  /** What the plan asks you to put into the pot from it. */
  putAsideCents: Cents;
  fixedCents: Cents;
  /** Expenses you pay straight from this paycheck, never saved for. */
  fromPay: FromPayItem[];
  fromPayCents: Cents;
  /** Everything it has to carry: put aside + fixed costs + paid from it. */
  loadCents: Cents;
  /** What it brings: what really arrived if you logged it, else your usual pay. Missing when unknown. */
  incomeCents?: Cents;
  /** True when the income is the amount you logged, not your usual pay. */
  incomeIsReal: boolean;
  /** What's left: income minus load. Below zero is over the limit. Missing while the income is unknown. */
  freeCents?: Cents;
}

export interface FreeBudgetInput {
  /** The savings plan, one entry per paycheck from the current one. */
  plan: MonthPlan[];
  /** Expenses paid straight from a paycheck. */
  fromPaycheck: Expense[];
  fixedCosts: FixedCost[];
  /** For the paychecks you logged with their real amount. */
  log: LogEntry[];
  usualPayCents: Cents | undefined;
  payday: number;
  /** The paycheck you're living on: the forecast starts here. */
  currentPaycheck: Month;
}

/** What an expense paid from a paycheck costs it: the real cost once it's done. */
function costOf(expense: Expense): Cents {
  return expense.done?.costCents ?? expense.targetCents;
}

/**
 * One row per paycheck, from the current one to the last that the plan or a
 * paid-from-paycheck expense reaches. Expenses from paychecks before the
 * current one are left out: they're the past, not the forecast.
 */
export function freeBudget({
  plan,
  fromPaycheck,
  fixedCosts,
  log,
  usualPayCents,
  payday,
  currentPaycheck,
}: FreeBudgetInput): FreeBudgetRow[] {
  const putAside = new Map(plan.map((monthPlan) => [monthPlan.month, monthPlan.totalCents]));
  const fromPay = new Map<Month, FromPayItem[]>();
  for (const expense of fromPaycheck) {
    const paycheck = fundingMonth(expense, payday);
    if (paycheck < currentPaycheck) continue;
    fromPay.set(paycheck, [...(fromPay.get(paycheck) ?? []), { id: expense.id, name: expense.name, cents: costOf(expense) }]);
  }
  const lastPaycheck = [...putAside.keys(), ...fromPay.keys()].reduce(
    (latest, month) => (month > latest ? month : latest),
    currentPaycheck,
  );
  if (putAside.size === 0 && fromPay.size === 0) return [];

  const fixedCents = fixedCosts.reduce((sum, cost) => sum + cost.amountCents, 0);
  const realPay = new Map(
    paychecksIn(log).flatMap((paycheck) => (paycheck.amountCents === undefined ? [] : [[paycheck.month, paycheck.amountCents] as const])),
  );

  const rows: FreeBudgetRow[] = [];
  for (let paycheck = currentPaycheck; paycheck <= lastPaycheck; paycheck = addMonths(paycheck, 1)) {
    const items = fromPay.get(paycheck) ?? [];
    const putAsideCents = putAside.get(paycheck) ?? 0;
    const fromPayCents = items.reduce((sum, item) => sum + item.cents, 0);
    const loadCents = putAsideCents + fixedCents + fromPayCents;
    const real = realPay.get(paycheck);
    const incomeCents = real ?? usualPayCents;
    rows.push({
      paycheck,
      putAsideCents,
      fixedCents,
      fromPay: items,
      fromPayCents,
      loadCents,
      ...(incomeCents === undefined ? {} : { incomeCents, freeCents: incomeCents - loadCents }),
      incomeIsReal: real !== undefined,
    });
  }
  return rows;
}
