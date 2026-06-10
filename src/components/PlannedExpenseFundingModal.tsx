import { useState } from 'react';
import { X } from 'lucide-react';
import { addMonths, runEngine } from '../engine/smoothing';
import { formatCurrency, formatMonth } from '../utils/formatting';
import type { BudgetState, EngineOutput, Month, PlannedExpense } from '../engine/types';

export type PlannedExpenseFundingChoice = 'include-current' | 'start-next';

// Matches smoothing.ts EPSILON — only prompt when the include-current path moves the rate.
const ENGINE_RATE_EPSILON = 0.001;

export function shouldAskPlannedExpenseFundingTiming(
  budget: BudgetState,
  engine: EngineOutput,
  draft: Omit<PlannedExpense, 'id'>,
  currentMonth: Month,
  options?: { replaceExpenseId?: string },
): boolean {
  if (draft.targetMonth <= currentMonth) {
    return false;
  }

  const baselineRate =
    engine.months.find(month => month.month === currentMonth)?.setAsideRecommended ?? 0;

  const { startFromMonth: _ignored, ...includeDraft } = draft;
  const previewEngine = runEngine(
    budgetWithDraftExpense(budget, includeDraft, options ?? {}),
    currentMonth,
  );
  const includeRate =
    previewEngine.months.find(month => month.month === currentMonth)?.setAsideRecommended ?? 0;

  return Math.abs(includeRate - baselineRate) > ENGINE_RATE_EPSILON;
}

function shortMonth(month: Month): string {
  return formatMonth(month).slice(0, 3);
}

function countMonthsInclusive(startMonth: Month, endMonth: Month): number {
  const [startYear, startMon] = startMonth.split('-').map(Number);
  const [endYear, endMon] = endMonth.split('-').map(Number);
  return (endYear - startYear) * 12 + (endMon - startMon) + 1;
}

function getCurrentLockedAmount(budget: BudgetState, currentMonth: Month): number {
  return budget.lockIns
    .filter(lock => lock.month === currentMonth)
    .reduce((sum, lock) => sum + lock.lockedAmount, 0);
}

function getFirstFutureRate(engine: EngineOutput, currentMonth: Month): number {
  return engine.months.find(month => month.month > currentMonth && month.setAsideRecommended > 0)
    ?.setAsideRecommended ?? 0;
}

function budgetWithDraftExpense(
  budget: BudgetState,
  draft: Omit<PlannedExpense, 'id'>,
  options: { replaceExpenseId?: string; startFromMonth?: Month },
): BudgetState {
  const expense: PlannedExpense = {
    id: options.replaceExpenseId ?? 'preview',
    ...draft,
    ...(options.startFromMonth ? { startFromMonth: options.startFromMonth } : {}),
  };

  if (options.replaceExpenseId) {
    return {
      ...budget,
      plannedExpenses: budget.plannedExpenses.map(e =>
        e.id === options.replaceExpenseId ? { ...e, ...expense } : e
      ),
    };
  }

  return {
    ...budget,
    plannedExpenses: [...budget.plannedExpenses, expense],
  };
}

export function applyFundingChoice(
  draft: Omit<PlannedExpense, 'id'>,
  choice: PlannedExpenseFundingChoice,
  currentMonth: Month,
): Omit<PlannedExpense, 'id'> {
  if (choice === 'start-next') {
    return { ...draft, startFromMonth: addMonths(currentMonth, 1) };
  }
  return {
    name: draft.name,
    amount: draft.amount,
    targetMonth: draft.targetMonth,
    category: draft.category,
    confidence: draft.confidence,
  };
}

interface PlannedExpenseFundingModalProps {
  draft: Omit<PlannedExpense, 'id'>;
  budget: BudgetState;
  engine: EngineOutput;
  currentMonth: Month;
  replaceExpenseId?: string;
  onClose: () => void;
  onConfirm: (expense: Omit<PlannedExpense, 'id'>) => void;
}

export function PlannedExpenseFundingModal({
  draft,
  budget,
  engine,
  currentMonth,
  replaceExpenseId,
  onClose,
  onConfirm,
}: PlannedExpenseFundingModalProps) {
  const [selectedFundingChoice, setSelectedFundingChoice] =
    useState<PlannedExpenseFundingChoice | null>(null);

  const nextMonth = addMonths(currentMonth, 1);
  const currentLockedAmount = getCurrentLockedAmount(budget, currentMonth);
  const monthsAvailable = countMonthsInclusive(nextMonth, draft.targetMonth);
  const monthWord = monthsAvailable === 1 ? 'month' : 'months';

  const optionOneEngine = runEngine(
    budgetWithDraftExpense(budget, draft, { replaceExpenseId }),
    currentMonth,
  );
  const optionOneCurrent = optionOneEngine.months.find(month => month.month === currentMonth);
  const optionOneRate = optionOneCurrent?.setAsideRecommended ?? 0;
  const additionalNeeded = Math.max(0, optionOneRate - currentLockedAmount);
  const optionOneFutureRate = getFirstFutureRate(optionOneEngine, currentMonth);

  const optionTwoEngine = runEngine(
    budgetWithDraftExpense(budget, draft, { replaceExpenseId, startFromMonth: nextMonth }),
    currentMonth,
  );
  const optionTwoFutureRate = getFirstFutureRate(optionTwoEngine, currentMonth);
  const baseFutureRate = getFirstFutureRate(engine, currentMonth);
  const optionOneFutureAdditional = Math.max(0, optionOneFutureRate - baseFutureRate);
  const optionTwoFutureAdditional = Math.max(0, optionTwoFutureRate - baseFutureRate);
  const showOptionTwoWarning =
    optionTwoFutureRate > optionTwoEngine.availablePerMonth * 0.8 || monthsAvailable < 2;

  function handleConfirm() {
    if (!selectedFundingChoice) return;
    onConfirm(applyFundingChoice(draft, selectedFundingChoice, currentMonth));
  }

  return (
    <div className="modal-overlay v6-planner-overlay" onClick={onClose}>
      <div
        className="modal v6-planner-modal v6-midmonth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="v6-funding-title"
        data-testid="mid-month-modal"
        onClick={event => event.stopPropagation()}
      >
        <div className="v6-planner-header v6-midmonth-header">
          <div>
            <p className="csv-wizard-kicker">Funding timing</p>
            <h2 id="v6-funding-title" className="modal-title">How do you want to fund {draft.name}?</h2>
            <p className="v6-card-caption">
              Choose whether saving starts in {shortMonth(currentMonth)} or from {shortMonth(nextMonth)} onward.
              Compare both scenarios before you commit — you do not need a lock-in for this step.
            </p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="v6-midmonth-summary" aria-label="Expense summary">
          <div>
            <span>Expense</span>
            <strong>{formatCurrency(draft.amount)}</strong>
          </div>
          <div>
            <span>Deadline</span>
            <strong>{formatMonth(draft.targetMonth)}</strong>
          </div>
          <div>
            <span>Set-aside if you include {shortMonth(currentMonth)}</span>
            <strong>{formatCurrency(optionOneRate)}</strong>
          </div>
          {currentLockedAmount > 0 && (
            <div>
              <span>Already locked this month</span>
              <strong>{formatCurrency(currentLockedAmount)}</strong>
            </div>
          )}
        </div>

        <div className="v6-midmonth-options" role="radiogroup" aria-label="Funding options">
          <button
            type="button"
            className={`v6-midmonth-option ${selectedFundingChoice === 'include-current' ? 'is-selected' : ''}`}
            role="radio"
            aria-checked={selectedFundingChoice === 'include-current'}
            data-testid="modal-option-1"
            onClick={() => setSelectedFundingChoice('include-current')}
          >
            <span className="v6-midmonth-radio" aria-hidden />
            <span className="v6-midmonth-option-copy">
              <span className="v6-midmonth-option-title">Include this month</span>
              <span className="v6-midmonth-option-desc">
                {currentLockedAmount > 0
                  ? `Set aside an additional ${formatCurrency(additionalNeeded)} this month (${formatCurrency(optionOneRate)} recommended total).`
                  : `Start saving in ${shortMonth(currentMonth)} — set aside ${formatCurrency(optionOneRate)} this month.`}
              </span>
              <span className="v6-midmonth-option-detail">
                Future impact: {optionOneFutureAdditional > 0
                  ? `${formatCurrency(optionOneFutureAdditional)} more per month, making the future set-aside ${formatCurrency(optionOneFutureRate)}/month.`
                  : `Future set-aside stays at ${formatCurrency(optionOneFutureRate)}/month.`}
              </span>
            </span>
          </button>

          <button
            type="button"
            className={`v6-midmonth-option ${selectedFundingChoice === 'start-next' ? 'is-selected' : ''}`}
            role="radio"
            aria-checked={selectedFundingChoice === 'start-next'}
            data-testid="modal-option-2"
            onClick={() => setSelectedFundingChoice('start-next')}
          >
            <span className="v6-midmonth-radio" aria-hidden />
            <span className="v6-midmonth-option-copy">
              <span className="v6-midmonth-option-title">Start from next month</span>
              <span className="v6-midmonth-option-desc">Nothing additional this month.</span>
              <span className="v6-midmonth-option-detail">
                Future impact: {formatCurrency(optionTwoFutureAdditional)} more per month for {monthsAvailable} {monthWord}, making the future set-aside {formatCurrency(optionTwoFutureRate)}/month.
              </span>
              {showOptionTwoWarning && (
                <span className="v6-midmonth-option-warning">
                  Starting next month leaves only {monthsAvailable} {monthWord}, so the future monthly amount may be tight.
                </span>
              )}
            </span>
          </button>
        </div>

        <div className="v6-midmonth-impact">
          <div>
            <span>Selected impact</span>
            <strong>
              {selectedFundingChoice === 'include-current'
                ? currentLockedAmount > 0
                  ? `${formatCurrency(additionalNeeded)} additional now`
                  : `${formatCurrency(optionOneRate)}/month from ${shortMonth(currentMonth)}`
                : selectedFundingChoice === 'start-next'
                  ? `${formatCurrency(optionTwoFutureAdditional)} more/month from ${shortMonth(nextMonth)}`
                  : 'Choose an option to preview the final effect'}
            </strong>
          </div>
        </div>

        <div className="csv-step-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!selectedFundingChoice}
            onClick={handleConfirm}
          >
            {selectedFundingChoice ? 'Confirm funding choice' : 'Choose an option'}
          </button>
        </div>
      </div>
    </div>
  );
}
