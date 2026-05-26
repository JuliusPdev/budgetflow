import { useCallback, useState } from 'react';
import type { BudgetState, Month } from '../engine/types';
import type {
  CategoryType,
  EnvelopeSurplusDecision,
  LeftoverAllocation,
  ParsedCsvRow,
  PlannedExpenseSurplusDecision,
  ReviewableTransaction,
  ReconciliationSummary,
  SubAccountMappings,
} from '../engine/csvImportTypes';
import { parseC24CsvFile, filterRowsByDateRange, uniqueKontonamen } from '../engine/csvParser';
import {
  allTransactionsReady,
  buildReviewableTransactions,
  toConfirmedTransactions,
} from '../engine/csvPreCategorize';
import {
  applyReconciliation,
  buildImportSession,
  computeReconciliationSummary,
} from '../engine/reconciliationApply';
import {
  confirmedForMonth,
  dedupeConfirmedByFingerprint,
  sortedAffectedMonths,
  incomeTotalsByMonth,
} from '../engine/importMatching';
import { applyIncomeByMonth } from '../engine/income';
import {
  loadImportSessions,
  loadSubAccountMappings,
  loadAllPriorConfirmed,
  saveImportSessions,
  saveSubAccountMappings,
  saveLastSettleMeta,
  getDefaultSettlePeriod,
  countOverlapWithPrior,
  loadLastSettleMeta,
} from '../utils/importStorage';
import { addMonths } from '../engine/smoothing';
import {
  reviewBuildKey,
  subAccountMappingsEqual,
} from '../engine/reviewBuildKey';

export type WizardStep =
  | 'file'
  | 'mapping'
  | 'review'
  | 'summary'
  | 'envelope-surplus'
  | 'leftover'
  | 'close';

interface UseCsvImportOptions {
  budget: BudgetState;
  currentMonth: Month;
  onApplyBudget: (budget: BudgetState) => void;
  potAvailableForMonth: (month: Month) => number;
}

export function useCsvImport({
  budget,
  currentMonth,
  onApplyBudget,
  potAvailableForMonth,
}: UseCsvImportOptions) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>('file');
  const [parseError, setParseError] = useState<string | null>(null);
  const [allRows, setAllRows] = useState<ParsedCsvRow[]>([]);
  const [periodRows, setPeriodRows] = useState<ParsedCsvRow[]>([]);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [overlapCount, setOverlapCount] = useState(0);
  const [mappings, setMappings] = useState<SubAccountMappings>(() =>
    loadSubAccountMappings(),
  );
  const [transactions, setTransactions] = useState<ReviewableTransaction[]>([]);
  const [lastReviewBuildKey, setLastReviewBuildKey] = useState<string | null>(null);
  const [summariesByMonth, setSummariesByMonth] = useState<
    Record<Month, ReconciliationSummary>
  >({});
  const [affectedMonths, setAffectedMonths] = useState<Month[]>([]);
  const [envelopeDecisions, setEnvelopeDecisions] = useState<EnvelopeSurplusDecision[]>([]);
  const [plannedExpenseSurplusDecisions, setPlannedExpenseSurplusDecisions] = useState<
    PlannedExpenseSurplusDecision[]
  >([]);
  const [leftoverByMonth, setLeftoverByMonth] = useState<
    Record<Month, { allocation: LeftoverAllocation; savingsGoalId?: string }>
  >({});
  const [pendingEnvelopes, setPendingEnvelopes] = useState<
    { month: Month; envelopeId: string; name: string; surplus: number }[]
  >([]);
  const [leftoverQueue, setLeftoverQueue] = useState<Month[]>([]);
  const [currentLeftoverMonth, setCurrentLeftoverMonth] = useState<Month | null>(null);
  const [updatePlannedIncome, setUpdatePlannedIncome] = useState(true);
  const [incomeUpdateResult, setIncomeUpdateResult] = useState<
    { month: Month; from: number; to: number }[]
  >([]);
  const [plannedIncomeUpdatePreview, setPlannedIncomeUpdatePreview] = useState<
    { month: Month; amount: number; previous: number }[]
  >([]);
  const [skippedMapping, setSkippedMapping] = useState(false);

  const resetWizard = useCallback(() => {
    const defaults = getDefaultSettlePeriod(currentMonth);
    setStep('file');
    setParseError(null);
    setAllRows([]);
    setPeriodRows([]);
    setPeriodStart(defaults.start);
    setPeriodEnd(defaults.end);
    setOverlapCount(0);
    setMappings(loadSubAccountMappings());
    setTransactions([]);
    setLastReviewBuildKey(null);
    setSummariesByMonth({});
    setAffectedMonths([]);
    setEnvelopeDecisions([]);
    setPlannedExpenseSurplusDecisions([]);
    setLeftoverByMonth({});
    setPendingEnvelopes([]);
    setLeftoverQueue([]);
    setCurrentLeftoverMonth(null);
    setUpdatePlannedIncome(true);
    setIncomeUpdateResult([]);
    setPlannedIncomeUpdatePreview([]);
    setSkippedMapping(false);
  }, [currentMonth]);

  const openWizard = useCallback(() => {
    resetWizard();
    setOpen(true);
  }, [resetWizard]);

  const closeWizard = useCallback(() => {
    setOpen(false);
  }, []);

  const applyPeriodFilter = useCallback(
    (rows: ParsedCsvRow[], start: string, end: string) => {
      const filtered = filterRowsByDateRange(rows, start, end);
      setPeriodRows(filtered);
      setOverlapCount(countOverlapWithPrior(rows, start, end));
      return filtered;
    },
    [],
  );

  const handleFile = useCallback(async (file: File) => {
    setParseError(null);
    const result = await parseC24CsvFile(file);
    if (!result.ok) {
      setParseError(result.error);
      return;
    }
    setAllRows(result.rows);
    const defaults = getDefaultSettlePeriod(currentMonth);
    setPeriodStart(defaults.start);
    setPeriodEnd(defaults.end);
    applyPeriodFilter(result.rows, defaults.start, defaults.end);
  }, [currentMonth, applyPeriodFilter]);

  const updatePeriodDraft = useCallback(
    (start: string, end: string) => {
      setPeriodStart(start);
      setPeriodEnd(end);
      if (allRows.length > 0) {
        applyPeriodFilter(allRows, start, end);
      }
      // Period draft only updates dates/filtered rows; review allocations stay until Continue.
    },
    [allRows, applyPeriodFilter],
  );

  const rebuildReviewTransactions = useCallback(
    (filtered: ParsedCsvRow[], map: SubAccountMappings, start: string, end: string) => {
      const prior = loadAllPriorConfirmed();
      setTransactions(
        buildReviewableTransactions(filtered, map, budget, currentMonth, prior),
      );
      setLastReviewBuildKey(reviewBuildKey(start, end, filtered, map));
    },
    [budget, currentMonth],
  );

  const selectPeriod = useCallback(
    (start: string, end: string) => {
      if (!start || !end || start > end) return;
      setPeriodStart(start);
      setPeriodEnd(end);
      const filtered = applyPeriodFilter(allRows, start, end);
      const known = loadSubAccountMappings();
      const names = uniqueKontonamen(filtered);
      const needsMapping = names.some(n => !known[n]);
      setMappings(known);
      if (needsMapping) {
        setSkippedMapping(false);
        setStep('mapping');
      } else {
        setSkippedMapping(true);
        const key = reviewBuildKey(start, end, filtered, known);
        if (key === lastReviewBuildKey && transactions.length > 0) {
          setStep('review');
        } else {
          rebuildReviewTransactions(filtered, known, start, end);
          setStep('review');
        }
      }
    },
    [
      allRows,
      applyPeriodFilter,
      lastReviewBuildKey,
      transactions.length,
      rebuildReviewTransactions,
    ],
  );

  const goBack = useCallback(() => {
    switch (step) {
      case 'file':
        break;
      case 'mapping':
        setStep('file');
        break;
      case 'review':
        setStep(skippedMapping ? 'file' : 'mapping');
        break;
      case 'summary':
        setStep('review');
        break;
      case 'envelope-surplus':
        setStep('summary');
        break;
      case 'leftover': {
        if (!currentLeftoverMonth) {
          setStep(pendingEnvelopes.length > 0 ? 'envelope-surplus' : 'summary');
          break;
        }
        const idx = leftoverQueue.indexOf(currentLeftoverMonth);
        if (idx > 0) {
          setCurrentLeftoverMonth(leftoverQueue[idx - 1]);
        } else {
          setStep(pendingEnvelopes.length > 0 ? 'envelope-surplus' : 'summary');
        }
        break;
      }
      default:
        break;
    }
  }, [
    step,
    skippedMapping,
    currentLeftoverMonth,
    leftoverQueue,
    pendingEnvelopes.length,
  ]);

  const saveMappings = useCallback(
    (next: SubAccountMappings) => {
      const key = reviewBuildKey(periodStart, periodEnd, periodRows, next);
      const mappingsUnchanged = subAccountMappingsEqual(next, mappings);
      if (
        mappingsUnchanged &&
        key === lastReviewBuildKey &&
        transactions.length > 0
      ) {
        setStep('review');
        return;
      }
      setMappings(next);
      saveSubAccountMappings(next);
      rebuildReviewTransactions(periodRows, next, periodStart, periodEnd);
      setStep('review');
    },
    [
      periodRows,
      periodStart,
      periodEnd,
      mappings,
      lastReviewBuildKey,
      transactions.length,
      rebuildReviewTransactions,
    ],
  );

  const updateRowCategory = useCallback(
    (
      id: string,
      category: CategoryType,
      links?: {
        linkedExpenseId?: string;
        linkedEnvelopeId?: string;
        linkedSavingsGoalId?: string;
        lockInMonth?: Month;
      },
    ) => {
      setTransactions(prev =>
        prev.map(t =>
          t.id === id
            ? {
                ...t,
                settledPreviously: false,
                confirmedCategory: category,
                confirmedLinkedExpenseId: links?.linkedExpenseId,
                confirmedLinkedEnvelopeId: links?.linkedEnvelopeId,
                confirmedLinkedSavingsGoalId: links?.linkedSavingsGoalId,
                lockInMonth:
                  category === 'set-aside-transfer'
                    ? links?.lockInMonth ?? t.lockInMonth
                    : undefined,
              }
            : t,
        ),
      );
    },
    [],
  );

  const goToSummary = useCallback(() => {
    if (!allTransactionsReady(transactions)) return;
    const confirmed = dedupeConfirmedByFingerprint(toConfirmedTransactions(transactions));
    const months = sortedAffectedMonths(confirmed);
    const byMonth: Record<Month, ReconciliationSummary> = {};
    for (const m of months) {
      byMonth[m] = computeReconciliationSummary(
        m,
        confirmedForMonth(m, confirmed),
        budget,
      );
    }
    setSummariesByMonth(byMonth);
    setAffectedMonths(months);

    const surpluses: { month: Month; envelopeId: string; name: string; surplus: number }[] = [];
    const plannedDecisions: PlannedExpenseSurplusDecision[] = [];
    for (const m of months) {
      const s = byMonth[m];
      for (const e of s.envelopeActuals.filter(x => x.surplus > 0)) {
        surpluses.push({ month: m, envelopeId: e.id, name: e.name, surplus: e.surplus });
      }
      for (const e of s.settledExpenses.filter(x => x.planned > x.actual)) {
        plannedDecisions.push({
          plannedExpenseId: e.id,
          surplus: e.planned - e.actual,
          choice: 'pot',
        });
      }
    }
    setPendingEnvelopes(surpluses);
    setEnvelopeDecisions(
      surpluses.map(e => ({
        month: e.month,
        envelopeId: e.envelopeId,
        surplus: e.surplus,
        choice: 'pot',
      })),
    );
    setPlannedExpenseSurplusDecisions(plannedDecisions);

    const withLeftover = months.filter(m => byMonth[m].leftoverFreeBudget > 0);
    setLeftoverQueue(withLeftover);
    setCurrentLeftoverMonth(withLeftover[0] ?? null);
    const totals = incomeTotalsByMonth(confirmed);
    const preview: { month: Month; amount: number; previous: number }[] = [];
    for (const [month, amount] of [...totals.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const previous = budget.incomeByMonth?.[month] ?? budget.income;
      if (Math.abs(amount - previous) >= 0.01) {
        preview.push({ month, amount, previous });
      }
    }
    setPlannedIncomeUpdatePreview(preview);
    setStep('summary');
  }, [transactions, budget, currentMonth]);

  const finalizeReconciliation = useCallback(() => {
    const confirmed = dedupeConfirmedByFingerprint(toConfirmedTransactions(transactions));
    const months = sortedAffectedMonths(confirmed);
    let nextBudget = budget;
    const sessions = loadImportSessions();

    for (const month of months) {
      const monthConfirmed = confirmedForMonth(month, confirmed);
      const summary = computeReconciliationSummary(month, monthConfirmed, nextBudget);
      const monthEnvelopes = envelopeDecisions.filter(d => d.month === month);
      const leftover = leftoverByMonth[month];
      nextBudget = applyReconciliation(nextBudget, {
        month,
        confirmed: monthConfirmed,
        envelopeSurplusDecisions: monthEnvelopes,
        plannedExpenseSurplusDecisions,
        leftoverFreeBudget: summary.leftoverFreeBudget,
        leftoverAllocation: leftover?.allocation ?? null,
        leftoverSavingsGoalId: leftover?.savingsGoalId,
        potAvailable: potAvailableForMonth(month),
      });
      sessions[month] = buildImportSession(
        month,
        monthConfirmed,
        summary,
        monthEnvelopes,
        plannedExpenseSurplusDecisions,
        leftover?.allocation ?? null,
        leftover?.savingsGoalId,
      );
    }

    const incomeResult: { month: Month; from: number; to: number }[] = [];
    if (updatePlannedIncome) {
      const totals = incomeTotalsByMonth(confirmed);
      for (const [month, amount] of totals) {
        const from = nextBudget.incomeByMonth?.[month] ?? nextBudget.income;
        if (Math.abs(amount - from) >= 0.01) {
          incomeResult.push({ month, from, to: amount });
        }
      }
      nextBudget = applyIncomeByMonth(nextBudget, totals);
    }

    onApplyBudget(nextBudget);
    saveImportSessions(sessions);
    setIncomeUpdateResult(incomeResult);

    const maxBooking = confirmed.reduce(
      (max, c) => (c.date > max ? c.date : max),
      periodEnd,
    );
    saveLastSettleMeta({
      periodStart,
      periodEnd,
      settledAt: new Date().toISOString(),
      maxBookingDate: maxBooking,
    });
    setStep('close');
  }, [
    transactions,
    budget,
    envelopeDecisions,
    plannedExpenseSurplusDecisions,
    leftoverByMonth,
    periodStart,
    periodEnd,
    potAvailableForMonth,
    onApplyBudget,
    updatePlannedIncome,
    currentMonth,
  ]);

  const proceedFromSummary = useCallback(() => {
    if (pendingEnvelopes.length > 0) {
      setStep('envelope-surplus');
    } else if (leftoverQueue.length > 0) {
      setCurrentLeftoverMonth(leftoverQueue[0]);
      setStep('leftover');
    } else {
      finalizeReconciliation();
    }
  }, [pendingEnvelopes, leftoverQueue, finalizeReconciliation]);

  const setEnvelopeDecision = useCallback((decision: EnvelopeSurplusDecision) => {
    setEnvelopeDecisions(prev => {
      const rest = prev.filter(
        d => !(d.month === decision.month && d.envelopeId === decision.envelopeId),
      );
      return [...rest, decision];
    });
  }, []);

  const setPlannedExpenseSurplusDecision = useCallback(
    (decision: PlannedExpenseSurplusDecision) => {
      setPlannedExpenseSurplusDecisions(prev => {
        const rest = prev.filter(d => d.plannedExpenseId !== decision.plannedExpenseId);
        return [...rest, decision];
      });
    },
  []);

  const proceedFromEnvelopes = useCallback(() => {
    if (leftoverQueue.length > 0) {
      setCurrentLeftoverMonth(leftoverQueue[0]);
      setStep('leftover');
    } else {
      finalizeReconciliation();
    }
  }, [leftoverQueue, finalizeReconciliation]);

  const setLeftoverForMonth = useCallback(
    (month: Month, allocation: LeftoverAllocation, savingsGoalId?: string) => {
      setLeftoverByMonth(prev => ({
        ...prev,
        [month]: { allocation, savingsGoalId },
      }));
    },
    [],
  );

  const proceedFromLeftover = useCallback(() => {
    if (!currentLeftoverMonth) {
      finalizeReconciliation();
      return;
    }
    const idx = leftoverQueue.indexOf(currentLeftoverMonth);
    const next = leftoverQueue[idx + 1];
    if (next) {
      setCurrentLeftoverMonth(next);
    } else {
      finalizeReconciliation();
    }
  }, [currentLeftoverMonth, leftoverQueue, finalizeReconciliation]);

  const lastSettle = loadLastSettleMeta();
  const defaultPeriod = getDefaultSettlePeriod(currentMonth);

  return {
    open,
    step,
    setStep,
    parseError,
    allRows,
    periodRows,
    periodStart,
    periodEnd,
    overlapCount,
    defaultPeriodStart: defaultPeriod.start,
    defaultPeriodEnd: defaultPeriod.end,
    lastSettleEnd: lastSettle?.periodEnd,
    mappings,
    transactions,
    summariesByMonth,
    affectedMonths,
    envelopeDecisions,
    plannedExpenseSurplusDecisions,
    leftoverByMonth,
    currentLeftoverMonth,
    pendingEnvelopes,
    openWizard,
    closeWizard,
    skippedMapping,
    handleFile,
    updatePeriodDraft,
    selectPeriod,
    goBack,
    saveMappings,
    updateRowCategory,
    goToSummary,
    proceedFromSummary,
    setEnvelopeDecision,
    setPlannedExpenseSurplusDecision,
    proceedFromEnvelopes,
    setLeftoverForMonth,
    proceedFromLeftover,
    finalizeReconciliation,
    updatePlannedIncome,
    setUpdatePlannedIncome,
    plannedIncomeUpdatePreview,
    incomeUpdateResult,
    kontonamenForMapping: uniqueKontonamen(periodRows.length > 0 ? periodRows : allRows),
    lockInMonthOptions: (() => {
      const opts: Month[] = [];
      for (let i = -1; i <= 2; i++) opts.push(addMonths(currentMonth, i));
      return opts;
    })(),
  };
}
