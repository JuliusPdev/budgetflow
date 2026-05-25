import { useState, Fragment } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { formatCurrency, formatMonth } from '../utils/formatting';
import type {
  BudgetState,
  Month,
  MonthResult,
  PlannedExpenseSettlement,
} from '../engine/types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  result:            MonthResult;
  budget:            BudgetState;
  currentMonth:      Month;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CurrentMonthManager({
  result,
  budget,
  currentMonth,
}: Props) {

  // ── Local state ──

  const [fixedExpanded,    setFixedExpanded]    = useState(false);
  const [plannedExpanded,  setPlannedExpanded]  = useState(true);

  // Fixed expense display total: substitute actual amounts for actualized envelopes.
  const fixedDisplayTotal = budget.fixedExpenses.reduce((s, e) => {
    if (e.isEnvelope) {
      const act = budget.envelopeActualizations.find(a => a.envelopeId === e.id && a.month === currentMonth);
      return s + (act ? act.actualAmount : e.amount);
    }
    return s + e.amount;
  }, 0);

  function getSettlement(id: string): PlannedExpenseSettlement | undefined {
    return (budget.plannedExpenseSettlements ?? []).find(s => s.plannedExpenseId === id);
  }

  function getPaidTowardPlanned(expenseId: string): number {
    return (budget.plannedExpensePayments ?? [])
      .filter(p => p.plannedExpenseId === expenseId)
      .reduce((sum, p) => sum + p.amount, 0);
  }

  function getPlannedSectionAmount(expense: MonthResult['plannedExpenses'][number]): number {
    const settlement = getSettlement(expense.id);
    if (settlement) return expense.amount;
    return Math.max(0, expense.amount - getPaidTowardPlanned(expense.id));
  }

  // Planned expenses total for the section header: show what is still left to fund.
  const plannedTotal = result.plannedExpenses.reduce(
    (sum, expense) => sum + getPlannedSectionAmount(expense),
    0,
  );

  return (
    <div className="card cmm-card" data-testid="current-month-detail-card">

      {/* ── 1. Header ─────────────────────────────────────────────────────── */}
      <div className="cmm-header">
        <span className="cmm-month-name">{formatMonth(currentMonth)}</span>
        <span className="cmm-badge">Current Month</span>
      </div>

      <hr className="divider" />

      {/* ── 2. Income ─────────────────────────────────────────────────────── */}
      <div className="cmm-section">
        <div className="cmm-row cmm-row--section-head">
          <span className="cmm-label">Income</span>
          <span className="cmm-amount income num">
            {formatCurrency(result.monthlyIncome + result.incomeCarryover)}
          </span>
        </div>
        {result.incomeCarryover > 0 && (
          <>
            <div className="cmm-row cmm-row--detail">
              <span className="cmm-detail-name">Monthly income</span>
              <span className="cmm-detail-amount income num">{formatCurrency(result.monthlyIncome)}</span>
            </div>
            <div className="cmm-row cmm-row--detail">
              <span className="cmm-detail-name">Carried over from previous month</span>
              <span className="cmm-detail-amount income num">+ {formatCurrency(result.incomeCarryover)}</span>
            </div>
          </>
        )}
      </div>

      {/* ── 3. Fixed expenses — title click to expand/collapse ────────────── */}
      {budget.fixedExpenses.length > 0 && (
        <div className="cmm-section">
          <div className="cmm-row cmm-row--section-head">
            <button
              className="cmm-section-toggle"
              onClick={() => setFixedExpanded(v => !v)}
              aria-expanded={fixedExpanded}
            >
              {fixedExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Fixed expenses
            </button>
            <span className="cmm-amount critical num">− {formatCurrency(fixedDisplayTotal)}</span>
          </div>

          {fixedExpanded && budget.fixedExpenses.map(e => {
            const actualization = e.isEnvelope
              ? budget.envelopeActualizations.find(a => a.envelopeId === e.id && a.month === currentMonth)
              : undefined;
            const displayAmount = actualization ? actualization.actualAmount : e.amount;

            return (
              <Fragment key={e.id}>
                <div className="cmm-row cmm-row--detail">
                  <span className="cmm-detail-name">
                    {e.name}
                    {e.isEnvelope && !actualization && (
                      <span className="envelope-badge">~</span>
                    )}
                    {actualization && (
                      <span className="envelope-badge envelope-badge--done">
                        <Check size={10} />
                      </span>
                    )}
                  </span>
                  <span className={`cmm-detail-amount num ${e.isEnvelope ? 'irregular' : ''}`}>
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

      {/* ── 6. Planned expenses — title click to expand/collapse ──────────── */}
      {result.plannedExpenses.length > 0 && (
        <>
          <hr className="divider" />
          <div className="cmm-section">
            <div className="cmm-row cmm-row--section-head">
              <button
                className="cmm-section-toggle"
                onClick={() => setPlannedExpanded(v => !v)}
                aria-expanded={plannedExpanded}
              >
                {plannedExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Planned this month
              </button>
              <span className="cmm-amount irregular num">− {formatCurrency(plannedTotal)}</span>
            </div>

            {plannedExpanded && result.plannedExpenses.map(expense => {
              const settlement = getSettlement(expense.id);
              const paidTowardExpense = getPaidTowardPlanned(expense.id);
              const remainingAmount = Math.max(0, expense.amount - paidTowardExpense);

              if (settlement) {
                const isOverspent = settlement.actualAmount > expense.amount;
                return (
                  <div key={expense.id} className="cmm-row cmm-row--detail mc-row--settled">
                    <span className="cmm-detail-name">
                      {expense.name}
                      <span className="mc-settled-badge">✓</span>
                    </span>
                    <span className={`cmm-detail-amount num ${isOverspent ? 'mc-detail-amount--over' : ''}`}>
                      {formatCurrency(settlement.actualAmount)}
                      <span className="mc-detail-budget-original"> / {formatCurrency(expense.amount)}</span>
                    </span>
                  </div>
                );
              }

              return (
                <div key={expense.id} className="cmm-row cmm-row--detail mc-row--settle-pending">
                  <span className="cmm-detail-name">
                    {expense.name}
                    {paidTowardExpense > 0 && (
                      <span className="mc-detail-budget-original">
                        {' '}· {formatCurrency(paidTowardExpense)} already paid
                      </span>
                    )}
                  </span>
                  <div className="cmm-row-end">
                    <span className="cmm-detail-amount irregular num">
                      {formatCurrency(remainingAmount)}
                      {paidTowardExpense > 0 && (
                        <span className="mc-detail-budget-original"> / {formatCurrency(expense.amount)}</span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <hr className="divider" />

      {/* ── 7. Pot balance ────────────────────────────────────────────────── */}
      <div className="cmm-pot-footer">
        <span
          className="mc-pot-label"
          title="Savings pot — accumulates over time and funds your planned expenses"
        >
          Pot
        </span>
        <span className="mc-pot-amount num">{formatCurrency(result.physicalPotAfter)}</span>
      </div>

    </div>
  );
}
