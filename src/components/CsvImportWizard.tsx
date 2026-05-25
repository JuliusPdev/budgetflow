import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { BudgetState, EngineOutput, Month } from '../engine/types';
import type { SubAccountMappings } from '../engine/csvImportTypes';
import { allTransactionsReady } from '../engine/csvPreCategorize';
import type { useCsvImport } from '../hooks/useCsvImport';
import { formatMonth } from '../utils/formatting';
import ImportFileStep from './csvImport/ImportFileStep';
import ImportDateRangeStep from './csvImport/ImportDateRangeStep';
import SubAccountMappingStep from './csvImport/SubAccountMappingStep';
import TransactionReviewStep from './csvImport/TransactionReviewStep';
import ReconciliationSummaryStep from './csvImport/ReconciliationSummaryStep';
import EnvelopeSurplusStep from './csvImport/EnvelopeSurplusStep';
import LeftoverFreeBudgetStep from './csvImport/LeftoverFreeBudgetStep';
import CloseMonthStep from './csvImport/CloseMonthStep';

type CsvImport = ReturnType<typeof useCsvImport>;

interface Props {
  csv: CsvImport;
  budget: BudgetState;
  engine: EngineOutput;
  currentMonth: Month;
}

const STEP_ORDER: CsvImport['step'][] = [
  'file',
  'mapping',
  'review',
  'summary',
  'envelope-surplus',
  'leftover',
  'close',
];

function buildMappingDraft(
  kontonamen: string[],
  mappings: SubAccountMappings,
): SubAccountMappings {
  const init: SubAccountMappings = { ...mappings };
  for (const name of kontonamen) {
    if (!init[name]) init[name] = { type: 'checking' };
  }
  return init;
}

function envelopeChoicesComplete(
  pending: { month: Month; envelopeId: string }[],
  decisions: { month: Month; envelopeId: string; choice: string; savingsGoalId?: string }[],
): boolean {
  return pending.every(p => {
    const d = decisions.find(
      x => x.month === p.month && x.envelopeId === p.envelopeId,
    );
    if (!d) return false;
    if (d.choice === 'savings') return Boolean(d.savingsGoalId);
    return true;
  });
}

export default function CsvImportWizard({ csv, budget, engine, currentMonth }: Props) {
  const [mappingDraft, setMappingDraft] = useState<SubAccountMappings>(csv.mappings);

  useEffect(() => {
    if (csv.step === 'mapping') {
      setMappingDraft(
        buildMappingDraft(csv.kontonamenForMapping, csv.mappings),
      );
    }
  }, [csv.step, csv.mappings, csv.kontonamenForMapping]);

  const stepTitle = useMemo(() => {
    if (csv.step === 'file') {
      return csv.allRows.length > 0 ? 'Settle period' : 'Upload CSV';
    }
    const titles: Record<CsvImport['step'], string> = {
      file: 'Upload CSV',
      mapping: 'Sub-account mapping',
      review: 'Review transactions',
      summary: 'Summary',
      'envelope-surplus': 'Envelope surplus',
      leftover: 'Leftover free budget',
      close: 'Period settled',
    };
    return titles[csv.step];
  }, [csv.step, csv.allRows.length]);

  const reviewReady = allTransactionsReady(csv.transactions);
  const envelopeReady = envelopeChoicesComplete(
    csv.pendingEnvelopes,
    csv.envelopeDecisions,
  );
  const leftoverAllocation =
    csv.currentLeftoverMonth != null
      ? csv.leftoverByMonth[csv.currentLeftoverMonth]?.allocation ?? null
      : null;

  const forward = useMemo(() => {
    switch (csv.step) {
      case 'file':
        if (csv.allRows.length === 0) {
          return { label: 'Continue', disabled: true, action: () => {} };
        }
        return {
          label: 'Continue',
          disabled:
            !csv.periodStart ||
            !csv.periodEnd ||
            csv.periodStart > csv.periodEnd ||
            csv.periodRows.length === 0,
          action: () => csv.selectPeriod(csv.periodStart, csv.periodEnd),
        };
      case 'mapping':
        return {
          label: 'Continue',
          disabled: false,
          action: () => csv.saveMappings(mappingDraft),
        };
      case 'review':
        return {
          label: 'Continue to summary',
          disabled: !reviewReady,
          action: csv.goToSummary,
        };
      case 'summary':
        return {
          label: 'Continue',
          disabled: csv.affectedMonths.length === 0,
          action: csv.proceedFromSummary,
        };
      case 'envelope-surplus':
        return {
          label: 'Continue',
          disabled: !envelopeReady,
          action: csv.proceedFromEnvelopes,
        };
      case 'leftover':
        return {
          label: 'Continue',
          disabled: leftoverAllocation == null,
          action: csv.proceedFromLeftover,
        };
      case 'close':
        return { label: 'Done', disabled: false, action: csv.closeWizard };
      default:
        return { label: 'Continue', disabled: true, action: () => {} };
    }
  }, [
    csv,
    mappingDraft,
    reviewReady,
    envelopeReady,
    leftoverAllocation,
  ]);

  if (!csv.open) return null;

  const stepIndex = Math.max(0, STEP_ORDER.indexOf(csv.step));
  const periodLabel =
    csv.periodStart && csv.periodEnd && csv.allRows.length > 0
      ? ` · ${csv.periodStart} – ${csv.periodEnd}`
      : '';

  const currentSummary = csv.currentLeftoverMonth
    ? csv.summariesByMonth[csv.currentLeftoverMonth]
    : null;

  const canGoBack =
    csv.step !== 'file' && csv.step !== 'close';

  return (
    <div className="modal-overlay csv-wizard-overlay" onClick={csv.closeWizard}>
      <div
        className="modal modal--csv-wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="csv-wizard-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header csv-wizard-header">
          <div>
            <p className="csv-wizard-kicker">
              Import &amp; settle{periodLabel}
            </p>
            <h2 id="csv-wizard-title" className="modal-title">{stepTitle}</h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={csv.closeWizard}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="csv-wizard-progress" aria-label={`Step ${stepIndex + 1} of ${STEP_ORDER.length}`}>
          {STEP_ORDER.map((step, index) => (
            <span key={step} className={index <= stepIndex ? 'is-active' : ''} />
          ))}
          <strong>Step {stepIndex + 1} / {STEP_ORDER.length}</strong>
        </div>

        <div className="csv-wizard-body">
          {csv.step === 'file' && (
            <>
              <ImportFileStep
                parseError={csv.parseError}
                rowCount={csv.allRows.length}
                onFile={csv.handleFile}
              />
              {csv.allRows.length > 0 && (
                <ImportDateRangeStep
                  periodStart={csv.periodStart}
                  periodEnd={csv.periodEnd}
                  rowCount={csv.periodRows.length}
                  overlapCount={csv.overlapCount}
                  lastSettleEnd={csv.lastSettleEnd}
                  defaultStart={csv.defaultPeriodStart}
                  onPeriodChange={csv.updatePeriodDraft}
                />
              )}
            </>
          )}

          {csv.step === 'mapping' && (
            <SubAccountMappingStep
              kontonamen={csv.kontonamenForMapping}
              draft={mappingDraft}
              onDraftChange={setMappingDraft}
              budget={budget}
            />
          )}

          {csv.step === 'review' && (
            <TransactionReviewStep
              transactions={csv.transactions}
              budget={budget}
              currentMonth={currentMonth}
              lockInMonthOptions={csv.lockInMonthOptions}
              onUpdateCategory={csv.updateRowCategory}
              onEditMapping={() => csv.setStep('mapping')}
            />
          )}

          {csv.step === 'summary' && csv.affectedMonths.length > 0 && (
            <ReconciliationSummaryStep
              budget={budget}
              summariesByMonth={csv.summariesByMonth}
              affectedMonths={csv.affectedMonths}
              plannedIncomeUpdatePreview={csv.plannedIncomeUpdatePreview}
              updatePlannedIncome={csv.updatePlannedIncome}
              onSetUpdatePlannedIncome={csv.setUpdatePlannedIncome}
              plannedExpenseSurplusDecisions={csv.plannedExpenseSurplusDecisions}
              onSetPlannedExpenseSurplusDecision={csv.setPlannedExpenseSurplusDecision}
            />
          )}

          {csv.step === 'envelope-surplus' && (
            <EnvelopeSurplusStep
              pending={csv.pendingEnvelopes}
              decisions={csv.envelopeDecisions}
              budget={budget}
              onSetDecision={csv.setEnvelopeDecision}
            />
          )}

          {csv.step === 'leftover' && csv.currentLeftoverMonth && currentSummary && (
            <LeftoverFreeBudgetStep
              monthLabel={formatMonth(csv.currentLeftoverMonth)}
              amount={currentSummary.leftoverFreeBudget}
              allocation={csv.leftoverByMonth[csv.currentLeftoverMonth]?.allocation ?? null}
              savingsGoalId={csv.leftoverByMonth[csv.currentLeftoverMonth]?.savingsGoalId}
              budget={budget}
              onSetAllocation={(a, goalId) => {
                csv.setLeftoverForMonth(csv.currentLeftoverMonth!, a, goalId);
              }}
            />
          )}

          {csv.step === 'close' && (
            <CloseMonthStep
              affectedMonths={csv.affectedMonths}
              summariesByMonth={csv.summariesByMonth}
              incomeUpdateResult={csv.incomeUpdateResult}
              engine={engine}
              onClose={csv.closeWizard}
            />
          )}
        </div>

        {csv.step !== 'close' && (
          <footer className="csv-wizard-footer">
            <button
              type="button"
              className="btn btn-ghost csv-wizard-footer-back"
              disabled={!canGoBack}
              onClick={csv.goBack}
            >
              <ChevronLeft size={18} aria-hidden />
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary csv-wizard-footer-forward"
              disabled={forward.disabled}
              onClick={forward.action}
            >
              {forward.label}
              <ChevronRight size={18} aria-hidden />
            </button>
          </footer>
        )}

        {csv.step === 'close' && (
          <footer className="csv-wizard-footer csv-wizard-footer--single">
            <button
              type="button"
              className="btn btn-primary"
              onClick={csv.closeWizard}
            >
              Done
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
