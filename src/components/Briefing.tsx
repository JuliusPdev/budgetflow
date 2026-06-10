import { formatCurrency, formatCurrencyExact, formatMonth } from '../utils/formatting';
import type { BudgetState, EngineOutput, Month, SavingsGoal } from '../engine/types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  engine:       EngineOutput;
  budget:       BudgetState;
  currentMonth: Month;
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function budgetColorClass(amount: number): string {
  if (amount > 300) return 'healthy';
  if (amount > 150) return 'tight';
  return 'critical';
}

// Counts how many calendar months separate two "YYYY-MM" strings.
function monthsBetween(from: Month, to: Month): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

// ─── Sub-component: Savings goal row ─────────────────────────────────────────

interface GoalRowProps {
  goal:         SavingsGoal;
  currentMonth: Month;
}

function GoalRow({ goal, currentMonth }: GoalRowProps) {
  if (goal.mode === 'monthly') {
    return (
      <div className="goal-row">
        <div className="goal-info">
          <span className="goal-name">{goal.name}</span>
          <span className="goal-detail savings">{formatCurrency(goal.monthlyAmount)}/mo</span>
        </div>
      </div>
    );
  }

  const remaining       = goal.targetAmount - goal.currentAmount;
  const progressPercent = Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100));
  const monthsLeft      = monthsBetween(currentMonth, goal.targetDate);
  const monthlyContrib  = monthsLeft > 0 ? remaining / monthsLeft : remaining;

  return (
    <div className="goal-row">
      <div className="goal-info">
        <span className="goal-name">{goal.name}</span>
        <span className="goal-detail">
          {formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}
          {' · '}
          <span className="savings">{formatCurrency(monthlyContrib)}/mo</span>
          {' · '}
          {formatMonth(goal.targetDate)}
        </span>
      </div>
      <div className="progress-bar" title={`${progressPercent}% saved`}>
        <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
      </div>
      <span className="goal-pct savings">{progressPercent}%</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Briefing({ engine, budget, currentMonth }: Props) {
  const current = engine.months.find(m => m.month === currentMonth);
  if (!current) return null;

  const { freeBudget, setAsideRecommended, lockStatus } = current;

  function getPaidTowardPlanned(expenseId: string): number {
    return (budget.plannedExpensePayments ?? [])
      .filter(p => p.plannedExpenseId === expenseId)
      .reduce((sum, p) => sum + p.amount, 0);
  }

  // Future planned expenses (target month strictly after current) for the savings tracker.
  const futurePlanned = budget.plannedExpenses
    .filter(e => e.targetMonth > currentMonth)
    .map(e => {
      const paid = getPaidTowardPlanned(e.id);
      return {
        ...e,
        paid,
        remaining: Math.max(0, e.amount - paid),
      };
    })
    .filter(e => e.remaining > 0);
  const totalFutureAmt = futurePlanned.reduce((s, e) => s + e.remaining, 0);

  // Unsettled planned expenses this month — informational, for the nudge message only.
  const unsettledCount = current.plannedExpenses.filter(e =>
    !(budget.plannedExpenseSettlements ?? []).some(
      s => s.plannedExpenseId === e.id && s.month === currentMonth
    )
  ).length;

  // Single contextual status sentence — no actions, purely informational.
  function getNudge(): string {
    if (freeBudget < 0)
      return 'Your expenses exceed your income this month. Consider adjusting your plan.';
    if (lockStatus.kind === 'additional-needed')
      return `Set aside an additional ${formatCurrencyExact(lockStatus.additionalNeeded)} this month.`;
    if (unsettledCount > 0)
      return unsettledCount === 1
        ? '1 planned expense to settle this month.'
        : `${unsettledCount} planned expenses to settle this month.`;
    if (lockStatus.kind === 'surplus')
      return `You can free up ${formatCurrencyExact(lockStatus.surplus)} this month.`;
    if (lockStatus.kind === 'unlocked' && setAsideRecommended > 0)
      return "Don't forget to lock in your set-aside for this month.";
    if (lockStatus.kind === 'on-track')
      return "You're on track this month.";
    return 'Everything looks good.';
  }

  return (
    <div className="card briefing" data-testid="briefing-card">

      {/* ── 1. Free budget headline ────────────────────────────────────────── */}
      <div className="briefing-headline">
        <span className="card-title">Free budget this month</span>
        <span
          className={`briefing-amount num ${budgetColorClass(freeBudget)}`}
          data-testid="free-budget-number"
        >
          {formatCurrency(freeBudget)}
        </span>
      </div>

      <hr className="divider" />

      {/* ── 2. Currently saving for ────────────────────────────────────────── */}
      <div className="briefing-planned">
        <span className="card-title">Currently saving for</span>

        {futurePlanned.length > 0
          ? futurePlanned.map(expense => {
              // Proportional pot share: allocate the pot across future expenses by size.
              const potShare    = totalFutureAmt > 0
                ? current.potAfter * (expense.remaining / totalFutureAmt)
                : 0;
              const progressPct = Math.min(100, Math.round((potShare / expense.remaining) * 100));
              const monthsUntil = monthsBetween(currentMonth, expense.targetMonth);
              const dotClass    = monthsUntil > 3
                ? 'status-dot--on-track'
                : monthsUntil > 1
                ? 'status-dot--tight'
                : 'status-dot--at-risk';

              return (
                <div key={expense.id} className="planned-expense-row">
                  <span className={`status-dot ${dotClass}`} />
                  <div className="planned-expense-info">
                    <span className="planned-expense-name">{expense.name}</span>
                    <span className="planned-expense-meta">
                      {formatMonth(expense.targetMonth)} · {formatCurrency(expense.remaining)}
                      {expense.paid > 0 && ` remaining / ${formatCurrency(expense.amount)} planned`}
                    </span>
                  </div>
                  <div className="planned-expense-progress">
                    <div
                      className="planned-expense-progress-fill"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              );
            })
          : <p className="briefing-empty-hint">No upcoming expenses planned.</p>
        }
      </div>

      <hr className="divider" />

      {/* ── 3. Savings goals ───────────────────────────────────────────────── */}
      <div className="briefing-goals">
        <span className="card-title">Savings goals</span>
        {budget.savingsGoals.length > 0
          ? budget.savingsGoals.map(goal => (
              <GoalRow key={goal.id} goal={goal} currentMonth={currentMonth} />
            ))
          : <p className="briefing-empty-hint">No savings goals yet — add one in Settings to plan ahead.</p>
        }
      </div>

      <hr className="divider" />

      {/* ── 4. Status message (informational only) ─────────────────────────── */}
      <p className="briefing-nudge">{getNudge()}</p>

    </div>
  );
}
