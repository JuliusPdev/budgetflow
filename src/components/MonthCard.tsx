import { useState, Fragment } from 'react';
import { Check, X } from 'lucide-react';
import { runEngine, addMonths } from '../engine/smoothing';
import { formatCurrency, formatMonth } from '../utils/formatting';
import type {
  BudgetState,
  EngineOutput,
  Month,
  MonthResult,
  PlannedExpense,
  PlannedExpenseSettlement,
} from '../engine/types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  result:                MonthResult;
  budget:                BudgetState;
  engine:                EngineOutput;
  currentMonth:          Month;
  isCurrentMonth:        boolean;
  isPastMonth:           boolean;
  isReconciled:          boolean;
  addPlannedExpense:     (e: Omit<PlannedExpense, 'id'>) => void;
  updatePlannedExpense:  (id: string, changes: Partial<Omit<PlannedExpense, 'id'>>) => void;
  removePlannedExpense:  (id: string) => void;
  removeUnplannedExpense:(id: string) => void;
  onStartReconciliation: (month: Month) => void;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

// Maps a free budget number to the CSS class name that colours it.
function budgetColor(amount: number): string {
  if (amount > 300) return 'healthy';
  if (amount > 150) return 'tight';
  return 'critical';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MonthCard({
  result,
  budget,
  engine,
  currentMonth,
  isCurrentMonth,
  isPastMonth,
  isReconciled,
  addPlannedExpense,
  updatePlannedExpense,
  removePlannedExpense,
  removeUnplannedExpense,
  onStartReconciliation,
}: Props) {

  // ── Local state for the "add expense" inline form ──
  // These variables only exist while the form is open. As soon as the user
  // confirms or cancels, they reset. Nothing here is saved to localStorage.
  const [addOpen,      setAddOpen]      = useState(false);
  const [addName,      setAddName]      = useState('');
  const [addAmountStr, setAddAmountStr] = useState('');

  // ── Mid-month funding choice modal ──
  // Set when the user submits an expense and the current month already has a lock-in.
  // Holds the name and amount they typed so the modal can show live calculations.
  const [midMonthModal, setMidMonthModal] = useState<{ name: string; amount: number } | null>(null);

  // ── Local state for inline editing of an existing expense ──
  // editingId tracks WHICH expense is being edited right now (null = none).
  const [editingId,     setEditingId]     = useState<string | null>(null);
  const [editName,      setEditName]      = useState('');
  const [editAmountStr, setEditAmountStr] = useState('');

  // ── Derived values ──
  const addAmount          = parseFloat(addAmountStr) || 0;
  // For the display total, substitute the actual amount for any envelope actualized this month.
  // The engine always uses budgeted amounts for A — this is display-only.
  const fixedDisplayTotal = budget.fixedExpenses.reduce((s, e) => {
    if (e.isEnvelope) {
      const act = budget.envelopeActualizations.find(a => a.envelopeId === e.id && a.month === result.month);
      return s + (act ? act.actualAmount : e.amount);
    }
    return s + e.amount;
  }, 0);
  const modeBTotal  = engine.modeBSavingsTotal;

  // Set-aside breakdown: how much is locked vs. still to be transferred.
  // For future months setAsideLocked is always 0 (nothing locked yet).
  const locked     = result.setAsideLocked;
  const toSetAside = Math.max(0, result.setAsideRecommended - locked);

  // Envelope surplus that was directed to pot this month.
  // Not tracked via LockInRecord (which would incorrectly reduce freeBudget), so we
  // compute it here directly from the actualization records for display purposes.
  const envelopePotThisMonth = budget.envelopeActualizations
    .filter(a => a.month === result.month && a.surplusDestination === 'pot')
    .reduce((s, a) => {
      const envelope = budget.fixedExpenses.find(e => e.id === a.envelopeId);
      return s + (envelope ? Math.max(0, envelope.amount - a.actualAmount) : 0);
    }, 0);

  function getSettlement(expenseId: string): PlannedExpenseSettlement | undefined {
    return (budget.plannedExpenseSettlements ?? []).find(
      s => s.plannedExpenseId === expenseId
    );
  }

  function getPaidTowardPlanned(expenseId: string): number {
    return (budget.plannedExpensePayments ?? [])
      .filter(p => p.plannedExpenseId === expenseId)
      .reduce((sum, p) => sum + p.amount, 0);
  }

  function getPlannedSectionAmount(expense: PlannedExpense): number {
    const settlement = getSettlement(expense.id);
    if (settlement) return expense.amount;
    return Math.max(0, expense.amount - getPaidTowardPlanned(expense.id));
  }

  // For the "Planned" section header, show the amount still left to fund.
  const plannedDisplayTotal = result.plannedExpenses.reduce((sum, e) => {
    return sum + getPlannedSectionAmount(e);
  }, 0);

  // ── Financial guardrail: speculative engine run ──
  //
  // When the user is typing a new expense, we run the engine with that
  // expense temporarily added and check what the current month's free
  // budget would become. This is just a preview — nothing is saved.
  //
  // We only do this when the add form is open AND the user has typed an
  // amount greater than 0. Before that there's nothing useful to show.
  let guardrailFreeBudget: number | null = null;
  if (addOpen && addAmount > 0) {
    const previewBudget: BudgetState = {
      ...budget,
      plannedExpenses: [
        ...budget.plannedExpenses,
        {
          id:          'preview',
          name:        addName || 'New expense',
          amount:      addAmount,
          targetMonth: result.month,
          category:    'general',
          confidence:  'confirmed',
        },
      ],
    };
    // runEngine is a pure function — safe to call speculatively.
    // We use availablePerMonth − setAsideRecommended rather than freeBudget because
    // freeBudget for the current month is anchored to the locked amount, not the new rate.
    // This shows the true forward-looking impact of adding the expense.
    const previewEngine = runEngine(previewBudget, currentMonth);
    const previewCurrent = previewEngine.months.find(m => m.month === currentMonth);
    const previewRate = previewCurrent?.setAsideRecommended ?? 0;
    const previewUnplanned = previewCurrent?.unplannedTotal ?? 0;
    guardrailFreeBudget = previewEngine.availablePerMonth - previewRate - previewUnplanned;
  }

  // ── Add expense handlers ──

  function submitAdd() {
    if (!addName.trim() || addAmount <= 0) return;

    // If the current month has a lock-in, check whether this expense would push the
    // recommended rate above what's already locked. If it does, the user needs to
    // choose how to fund the shortfall — show the modal. If the rate stays within
    // the locked amount (the expense spreads thin enough across future months), there
    // is nothing to decide: Option 1 is free, so just save normally.
    const hasLockIn = budget.lockIns.some(l => l.month === currentMonth && l.lockedAmount > 0);
    if (hasLockIn) {
      const previewBudget: BudgetState = {
        ...budget,
        plannedExpenses: [
          ...budget.plannedExpenses,
          { id: 'preview', name: addName.trim(), amount: addAmount,
            targetMonth: result.month, category: 'general', confidence: 'confirmed' as const },
        ],
      };
      const previewEngine    = runEngine(previewBudget, currentMonth);
      const previewRate      = previewEngine.months.find(m => m.month === currentMonth)?.setAsideRecommended ?? 0;
      const currentLockedAmt = budget.lockIns.find(l => l.month === currentMonth)?.lockedAmount ?? 0;
      const additionalNeeded = Math.max(0, previewRate - currentLockedAmt);

      if (additionalNeeded > 0) {
        setMidMonthModal({ name: addName.trim(), amount: addAmount });
        return;
      }
      // additionalNeeded === 0: the expense fits within the existing lock-in, save directly.
    }

    addPlannedExpense({
      name:        addName.trim(),
      amount:      addAmount,
      targetMonth: result.month,
      category:    'general',
      confidence:  'confirmed',
    });
    setAddName('');
    setAddAmountStr('');
    setAddOpen(false);
  }

  function handleIncludeThisMonth() {
    if (!midMonthModal) return;
    addPlannedExpense({
      name:        midMonthModal.name,
      amount:      midMonthModal.amount,
      targetMonth: result.month,
      category:    'general',
      confidence:  'confirmed',
    });
    setMidMonthModal(null);
    setAddName('');
    setAddAmountStr('');
    setAddOpen(false);
  }

  function handleStartFromNextMonth() {
    if (!midMonthModal) return;
    addPlannedExpense({
      name:          midMonthModal.name,
      amount:        midMonthModal.amount,
      targetMonth:   result.month,
      category:      'general',
      confidence:    'confirmed',
      startFromMonth: addMonths(currentMonth, 1),
    });
    setMidMonthModal(null);
    setAddName('');
    setAddAmountStr('');
    setAddOpen(false);
  }

  // ── Edit expense handlers ──

  function startEdit(expense: PlannedExpense) {
    setEditingId(expense.id);
    setEditName(expense.name);
    setEditAmountStr(String(expense.amount));
  }

  function commitEdit(id: string) {
    const amount = parseFloat(editAmountStr);
    if (editName.trim() && amount > 0) {
      updatePlannedExpense(id, { name: editName.trim(), amount });
    }
    setEditingId(null);
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div
      className={`month-card ${isCurrentMonth ? 'month-card--current' : ''} ${isPastMonth ? 'month-card--past' : ''} ${isReconciled ? 'month-card--reconciled' : ''}`}
    >

      {/* ── Header: month name + NOW badge ───────────────────────────────── */}
      <div className="mc-header">
        <span className="mc-month-name">{formatMonth(result.month)}</span>
        {isCurrentMonth && <span className="badge badge-now">NOW</span>}
        {isReconciled && <span className="badge badge-reconciled">Reconciled</span>}
      </div>

      {isPastMonth && (
        <button
          type="button"
          className="btn btn-secondary btn-sm mc-reconcile-btn"
          onClick={() => onStartReconciliation(result.month)}
          data-testid="month-end-reconciliation-btn"
        >
          {isReconciled ? 'Reconcile again' : 'Month-end reconciliation'}
        </button>
      )}

      {/* ── Income ───────────────────────────────────────────────────────── */}
      <div className="mc-section">
        <div className="mc-row">
          <span className="mc-label">Income</span>
          <span className="mc-amount income num">
            {formatCurrency(result.monthlyIncome + result.incomeCarryover)}
          </span>
        </div>
        {result.incomeCarryover > 0 && (
          <>
            <div className="mc-row mc-row--detail">
              <span className="mc-detail-name">Monthly income</span>
              <span className="mc-detail-amount income num">{formatCurrency(result.monthlyIncome)}</span>
            </div>
            <div className="mc-row mc-row--detail">
              <span className="mc-detail-name">Carried over</span>
              <span className="mc-detail-amount income num">+ {formatCurrency(result.incomeCarryover)}</span>
            </div>
          </>
        )}
      </div>

      {/* ── Fixed expenses ────────────────────────────────────────────────── */}
      {budget.fixedExpenses.length > 0 && (
        <div className="mc-section">
          <div className="mc-row mc-row--section-head">
            <span className="mc-label">Fixed</span>
            <span className="mc-amount critical num">− {formatCurrency(fixedDisplayTotal)}</span>
          </div>
          {budget.fixedExpenses.map(e => {
            const actualization = e.isEnvelope
              ? budget.envelopeActualizations.find(a => a.envelopeId === e.id && a.month === result.month)
              : undefined;
            const displayAmount = actualization ? actualization.actualAmount : e.amount;

            return (
              <Fragment key={e.id}>
                <div className="mc-row mc-row--detail">
                  <span className="mc-detail-name">
                    {e.name}
                    {e.isEnvelope && !actualization && (
                      <span className="envelope-badge">~</span>
                    )}
                    {actualization && <span className="envelope-badge envelope-badge--done">✓</span>}
                  </span>
                  <span className={`mc-detail-amount num ${e.isEnvelope ? 'envelope' : ''}`}>
                    {formatCurrency(displayAmount)}
                    {actualization && actualization.actualAmount !== e.amount && (
                      <span className="mc-detail-budget-original"> / {formatCurrency(e.amount)}</span>
                    )}
                  </span>
                </div>
              </Fragment>
            );
          })}
        </div>
      )}

      {/* ── Mode B savings contributions ─────────────────────────────────── */}
      {modeBTotal > 0 && (
        <div className="mc-section">
          <div className="mc-row mc-row--section-head">
            <span className="mc-label">Savings</span>
            <span className="mc-amount savings num">− {formatCurrency(modeBTotal)}</span>
          </div>
          {budget.savingsGoals
            .filter(g => g.mode === 'monthly')
            .map(g => (
              <div key={g.id} className="mc-row mc-row--detail">
                <span className="mc-detail-name">{g.name}</span>
                <span className="mc-detail-amount savings num">
                  {formatCurrency(g.mode === 'monthly' ? g.monthlyAmount : 0)}
                </span>
              </div>
            ))}
        </div>
      )}

      {/* ── Spent this month (unplanned expenses) ────────────────────────── */}
      {(isCurrentMonth || isPastMonth) && (
        <div className="mc-section">
          <div className="mc-row mc-row--section-head">
            <span className="mc-label">Spent this month</span>
            <span className="mc-amount spent num">
              {result.unplannedTotal > 0 ? `− ${formatCurrency(result.unplannedTotal)}` : '—'}
            </span>
          </div>

          {result.unplannedExpenses.map(expense => (
            isPastMonth
              ? (
                <div key={expense.id} className="mc-row mc-row--detail">
                  <span className="mc-detail-name">{expense.name}</span>
                  <span className="mc-detail-amount spent num">{formatCurrency(expense.amount)}</span>
                </div>
              )
              : (
                <div key={expense.id} className="mc-row mc-row--detail mc-row--editable">
                  <span className="mc-detail-name">{expense.name}</span>
                  <span className="mc-detail-amount spent num">{formatCurrency(expense.amount)}</span>
                  <button
                    className="mc-delete-btn"
                    title="Remove"
                    onClick={() => removeUnplannedExpense(expense.id)}
                  ><X size={14} /></button>
                </div>
              )
          ))}
        </div>
      )}

      {/* ── Set-aside ─────────────────────────────────────────────────────── */}
      {(result.setAsideRecommended > 0 || locked > 0 || envelopePotThisMonth > 0) && (
        <div className="mc-section">
          <div className="mc-row mc-row--section-head">
            <span className="mc-label">Set aside</span>
            <span className="mc-amount num">
              {formatCurrency(
                result.setAsideRecommended > 0
                  ? result.setAsideRecommended
                  : locked > 0 ? locked : envelopePotThisMonth
              )}
            </span>
          </div>
          {locked > 0 && (
            <div className="mc-row mc-row--detail">
              <span className="mc-detail-name">Locked ✓</span>
              <span className="mc-detail-amount healthy num">{formatCurrency(locked)}</span>
            </div>
          )}
          {envelopePotThisMonth > 0 && (
            <div className="mc-row mc-row--detail">
              <span className="mc-detail-name">Envelope surplus → pot ✓</span>
              <span className="mc-detail-amount healthy num">{formatCurrency(envelopePotThisMonth)}</span>
            </div>
          )}
          {toSetAside > 0 && (
            <div className="mc-row mc-row--detail">
              <span className="mc-detail-name">To set aside</span>
              <span className="mc-detail-amount num">{formatCurrency(toSetAside)}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Planned expenses ─────────────────────────────────────────────── */}
      <div className="mc-section">
        <div className="mc-row mc-row--section-head">
          <span className="mc-label">Planned</span>
          <span className="mc-amount irregular num">
            {plannedDisplayTotal > 0 ? `− ${formatCurrency(plannedDisplayTotal)}` : '—'}
          </span>
        </div>

        {/* Each planned expense for this month */}
        {result.plannedExpenses.map(expense => {
          const paidTowardExpense = getPaidTowardPlanned(expense.id);
          const remainingAmount = Math.max(0, expense.amount - paidTowardExpense);
          const settlement = getSettlement(expense.id);

          if (settlement) {
            const isOverspent = settlement.actualAmount > expense.amount;
            return (
              <div key={expense.id} className="mc-row mc-row--detail mc-row--settled">
                <span className="mc-detail-name">
                  {expense.name}
                  <span className="mc-settled-badge">✓</span>
                </span>
                <span className={`mc-detail-amount num ${isOverspent ? 'mc-detail-amount--over' : ''}`}>
                  {formatCurrency(settlement.actualAmount)}
                  <span className="mc-detail-budget-original"> / {formatCurrency(expense.amount)}</span>
                </span>
              </div>
            );
          }

          // ── Past month: read-only display ──
          if (isPastMonth) {
            return (
              <div key={expense.id} className="mc-row mc-row--detail">
                <span className="mc-detail-name">
                  {expense.name}
                  {paidTowardExpense > 0 && (
                    <span className="mc-detail-budget-original">
                      {' '}· {formatCurrency(paidTowardExpense)} already paid
                    </span>
                  )}
                </span>
                <span className="mc-detail-amount irregular num">
                  {formatCurrency(remainingAmount)}
                  {paidTowardExpense > 0 && (
                    <span className="mc-detail-budget-original"> / {formatCurrency(expense.amount)}</span>
                  )}
                </span>
              </div>
            );
          }

          // ── Current month, pending settlement from CSV import ──
          if (isCurrentMonth && !isReconciled) {
            return (
              <div key={expense.id} className="mc-row mc-row--detail mc-row--settle-pending">
                <span className="mc-detail-name">
                  {expense.name}
                  {paidTowardExpense > 0 && (
                    <span className="mc-detail-budget-original">
                      {' '}· {formatCurrency(paidTowardExpense)} already paid
                    </span>
                  )}
                </span>
                <span className="mc-detail-amount irregular num">
                  {formatCurrency(remainingAmount)}
                  {paidTowardExpense > 0 && (
                    <span className="mc-detail-budget-original"> / {formatCurrency(expense.amount)}</span>
                  )}
                </span>
              </div>
            );
          }

          // ── Future month, editing mode ──
          if (editingId === expense.id) {
            return (
              <div key={expense.id} className="mc-edit-row">
                <input
                  className="input mc-edit-name"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  commitEdit(expense.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  autoFocus
                />
                <div className="input-prefix mc-edit-amount">
                  <input
                    className="input"
                    type="number"
                    min="0"
                    value={editAmountStr}
                    onChange={e => setEditAmountStr(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter')  commitEdit(expense.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                  />
                </div>
                <button className="mc-action-btn" onClick={() => commitEdit(expense.id)}><Check size={14} /></button>
                <button className="mc-action-btn" onClick={() => setEditingId(null)}><X size={14} /></button>
              </div>
            );
          }

          // ── Future month, display mode ──
          return (
            <div
              key={expense.id}
              className="mc-row mc-row--detail mc-row--editable"
              onClick={() => startEdit(expense)}
              title="Click to edit"
            >
              <span className="mc-detail-name">
                {expense.name}
                {paidTowardExpense > 0 && (
                  <span className="mc-detail-budget-original">
                    {' '}· {formatCurrency(paidTowardExpense)} already paid
                  </span>
                )}
              </span>
              <span className="mc-detail-amount irregular num">
                {formatCurrency(remainingAmount)}
                {paidTowardExpense > 0 && (
                  <span className="mc-detail-budget-original"> / {formatCurrency(expense.amount)}</span>
                )}
              </span>
              <button
                className="mc-delete-btn"
                title="Remove expense"
                onClick={e => {
                  e.stopPropagation();
                  removePlannedExpense(expense.id);
                }}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}

        {/* ── Empty state for future months with no expenses ── */}
        {!isPastMonth && !isCurrentMonth && result.plannedExpenses.length === 0 && !addOpen && (
          <p className="mc-empty-hint">No expenses planned yet</p>
        )}

        {/* ── Add expense form (future months only — current month uses "Spent this month") ── */}
        {!isPastMonth && !isCurrentMonth && addOpen ? (
          <div className="mc-add-form">
            <div className="mc-add-inputs">
              <input
                className="input"
                placeholder="Expense name"
                value={addName}
                onChange={e => setAddName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') setAddAmountStr(''); }}
                autoFocus
              />
              <div className="input-prefix">
                <input
                  className="input"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={addAmountStr}
                  onChange={e => setAddAmountStr(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitAdd(); }}
                />
              </div>
            </div>

            {/* Guardrail: show projected free budget impact */}
            {guardrailFreeBudget !== null && (
              <p className={`mc-guardrail ${budgetColor(guardrailFreeBudget)}`}>
                {guardrailFreeBudget > 300
                  ? `Free budget stays at ${formatCurrency(guardrailFreeBudget)}/mo. All good.`
                  : guardrailFreeBudget > 150
                  ? `Free budget drops to ${formatCurrency(guardrailFreeBudget)}/mo. Getting tight.`
                  : guardrailFreeBudget > 0
                  ? `Free budget drops to ${formatCurrency(guardrailFreeBudget)}/mo. Watch out.`
                  : 'This would push your free budget negative.'}
              </p>
            )}

            <div className="mc-add-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => { setAddOpen(false); setAddName(''); setAddAmountStr(''); }}>
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" onClick={submitAdd}>
                Add
              </button>
            </div>
          </div>
        ) : !isPastMonth && !isCurrentMonth ? (
          <button className="mc-add-btn" onClick={() => setAddOpen(true)}>
            + Add expense
          </button>
        ) : null}
      </div>

      {/* ── Free budget ───────────────────────────────────────────────────── */}
      <div className="mc-free-budget">
        <span className="mc-free-label">Free budget</span>
        <span className={`mc-free-amount num ${budgetColor(result.freeBudget)}`}>
          {formatCurrency(result.freeBudget)}
        </span>
      </div>

      {/* ── Pot balance ───────────────────────────────────────────────────── */}
      <div className="mc-pot-balance">
        <span className="mc-pot-label" title="Savings pot — accumulates over time and funds your planned expenses">Pot</span>
        <span className="mc-pot-amount num">{formatCurrency(result.potAfter)}</span>
      </div>

      {/* ── Mid-month funding choice modal ──────────────────────────────── */}
      {/* Shown when the user adds an expense and the current month already has a lock-in. */}
      {midMonthModal && (() => {
        const nextMonth        = addMonths(currentMonth, 1);
        const currentLockedAmt = budget.lockIns.find(l => l.month === currentMonth)?.lockedAmount ?? 0;

        // Option 1 speculative run: include current month in distribution (normal behavior)
        const opt1Budget: BudgetState = {
          ...budget,
          plannedExpenses: [
            ...budget.plannedExpenses,
            { id: 'preview', name: midMonthModal.name, amount: midMonthModal.amount,
              targetMonth: result.month, category: 'general', confidence: 'confirmed' as const },
          ],
        };
        const opt1Engine    = runEngine(opt1Budget, currentMonth);
        const opt1Current   = opt1Engine.months.find(m => m.month === currentMonth);
        const opt1Rate      = opt1Current?.setAsideRecommended ?? 0;
        const additionalNeeded = Math.max(0, opt1Rate - currentLockedAmt);
        const opt1FutureMonth  = opt1Engine.months.find(
          m => m.month > currentMonth && m.setAsideRecommended > 0
        );
        const opt1FutureRate = opt1FutureMonth?.setAsideRecommended ?? 0;

        // Option 2 speculative run: defer to next month (startFromMonth = nextMonth)
        const opt2Budget: BudgetState = {
          ...budget,
          plannedExpenses: [
            ...budget.plannedExpenses,
            { id: 'preview', name: midMonthModal.name, amount: midMonthModal.amount,
              targetMonth: result.month, category: 'general', confidence: 'confirmed' as const,
              startFromMonth: nextMonth },
          ],
        };
        const opt2Engine      = runEngine(opt2Budget, currentMonth);
        const opt2FutureMonth = opt2Engine.months.find(
          m => m.month > currentMonth && m.setAsideRecommended > 0
        );
        const opt2Rate = opt2FutureMonth?.setAsideRecommended ?? 0;

        // Number of months from next month to the target (inclusive)
        let monthsAvailable = 0;
        let m = nextMonth;
        while (m <= result.month) { monthsAvailable++; m = addMonths(m, 1); }

        // Baseline future rate BEFORE adding the new expense — used to compute increments.
        // The `engine` prop comes from the parent and reflects the budget without this expense.
        const baseFutureMonth = engine.months.find(
          mo => mo.month > currentMonth && mo.setAsideRecommended > 0
        );
        const baseFutureRate = baseFutureMonth?.setAsideRecommended ?? 0;

        // How much MORE per future month does each option add on top of what was already needed?
        const opt1FutureAdditional = Math.max(0, opt1FutureRate - baseFutureRate);
        const opt2FutureAdditional = Math.max(0, opt2Rate - baseFutureRate);

        // Warning when Option 2 leaves very little room — rate exceeds 80% of available income
        const showOpt2Warning = opt2Rate > opt1Engine.availablePerMonth * 0.8 || monthsAvailable < 2;

        const s = monthsAvailable !== 1 ? 's' : '';

        return (
          <div className="modal-overlay" onClick={() => setMidMonthModal(null)}>
            <div
              className="modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="midmonth-modal-title"
              data-testid="mid-month-modal"
              onClick={e => e.stopPropagation()}
            >
              <div className="modal-header">
                <h2 id="midmonth-modal-title" className="modal-title">
                  How do you want to fund {midMonthModal.name}?
                </h2>
                <button className="modal-close-btn" onClick={() => setMidMonthModal(null)} aria-label="Close">
                  <X size={18} />
                </button>
              </div>
              <p className="modal-body">
                You've already locked in {formatCurrency(currentLockedAmt)} this month. Choose when to start saving for this expense:
              </p>

              <div className="mc-midmonth-options">

                <div className="mc-midmonth-option" data-testid="modal-option-1">
                  <span className="mc-midmonth-option-title">Include this month</span>
                  <span className="mc-midmonth-option-desc">
                    {additionalNeeded > 0
                      ? `Set aside an additional ${formatCurrency(additionalNeeded)} this month`
                      : 'No extra set-aside needed this month'}
                    {opt1FutureAdditional > 0
                      ? `, then ${formatCurrency(opt1FutureAdditional)} more/month for ${monthsAvailable} month${s} (${formatCurrency(opt1FutureRate)}/month total).`
                      : opt1FutureRate > 0
                        ? `. Future rate stays at ${formatCurrency(opt1FutureRate)}/month.`
                        : '.'}
                  </span>
                </div>

                <div className="mc-midmonth-option" data-testid="modal-option-2">
                  <span className="mc-midmonth-option-title">Start from next month</span>
                  <span className="mc-midmonth-option-desc">
                    {opt2FutureAdditional > 0
                      ? `${formatCurrency(opt2FutureAdditional)} more/month for ${monthsAvailable} month${s} (${formatCurrency(opt2Rate)}/month total). Nothing additional this month.`
                      : `No change to future rates. Nothing additional this month.`}
                  </span>
                  {showOpt2Warning && (
                    <span className="mc-midmonth-option-warning">
                      Starting next month leaves only {monthsAvailable} month{s} — {formatCurrency(opt2FutureAdditional)} more/month needed, bringing the total to {formatCurrency(opt2Rate)}/month. May be very tight.
                    </span>
                  )}
                </div>

              </div>

              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={() => setMidMonthModal(null)}>
                  Cancel
                </button>
                <button className="btn btn-secondary" onClick={handleStartFromNextMonth}>
                  Start from next month
                </button>
                <button className="btn btn-primary" onClick={handleIncludeThisMonth}>
                  Include this month
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
