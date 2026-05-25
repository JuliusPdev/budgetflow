import { useMemo, useState } from 'react';
import { formatCurrencyExact, formatMonth } from '../../utils/formatting';
import type { BudgetState, Month } from '../../engine/types';
import type { CategoryType, ReviewableTransaction } from '../../engine/csvImportTypes';
import { bookingMonth } from '../../engine/importMatching';
import {
  CATEGORY_LABELS,
  allTransactionsReady,
  transactionNeedsDetails,
} from '../../engine/csvPreCategorize';
import { countNewTransactions } from '../../engine/importMatching';

function formatTxDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface Props {
  transactions: ReviewableTransaction[];
  budget: BudgetState;
  currentMonth: Month;
  lockInMonthOptions: Month[];
  onUpdateCategory: (
    id: string,
    category: CategoryType,
    links?: {
      linkedExpenseId?: string;
      linkedEnvelopeId?: string;
      linkedSavingsGoalId?: string;
      lockInMonth?: Month;
    },
  ) => void;
  onEditMapping: () => void;
}

export default function TransactionReviewStep({
  transactions,
  budget,
  currentMonth,
  lockInMonthOptions,
  onUpdateCategory,
  onEditMapping,
}: Props) {
  const [selectedId, setSelectedId] = useState(transactions[0]?.id ?? '');
  const selected = useMemo(
    () => transactions.find(t => t.id === selectedId) ?? transactions[0],
    [selectedId, transactions],
  );
  const { newCount, settledCount } = countNewTransactions(transactions);
  const needsDetailCount = transactions.filter(
    t => !t.settledPreviously && transactionNeedsDetails(t),
  ).length;
  const ready = allTransactionsReady(transactions);
  const hardFixed = budget.fixedExpenses.filter(e => !e.isEnvelope);
  const envelopes = budget.fixedExpenses.filter(e => e.isEnvelope);
  const planned = budget.plannedExpenses;
  const targetGoals = budget.savingsGoals.filter(
    (g): g is Extract<typeof g, { mode: 'target' }> => g.mode === 'target',
  );

  if (!selected) {
    return (
      <div className="csv-step">
        <p className="csv-step-intro">No transactions in this period.</p>
      </div>
    );
  }

  const selectedCategory = selected.confirmedCategory ?? selected.suggestion.category;
  const selectedNeedsDetails = !selected.settledPreviously && transactionNeedsDetails(selected);
  const rowMonth = bookingMonth(selected.row.bookingDate);

  function handleCategoryChange(category: CategoryType) {
    onUpdateCategory(selected.id, category, {
      lockInMonth: category === 'set-aside-transfer' ? selected.lockInMonth : undefined,
    });
  }

  return (
    <div className="csv-step csv-step--wide">
      <div className="csv-review-toolbar csv-review-toolbar--desktop">
        <div>
          <span className="csv-progress">
            {newCount} new · {settledCount} already settled
          </span>
          <span className={`csv-ready-state ${ready ? 'csv-ready-state--ready' : 'csv-ready-state--needs-work'}`}>
            {ready ? 'Ready to continue' : `${needsDetailCount} need details`}
          </span>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onEditMapping}>
          Edit mapping
        </button>
      </div>

      <div className="csv-review-shell">
        <div className="csv-transaction-list" aria-label="Imported transactions">
          {transactions.map(tx => {
            const category = tx.confirmedCategory ?? tx.suggestion.category;
            const needsDetails = !tx.settledPreviously && transactionNeedsDetails(tx);
            const isSelected = tx.id === selected.id;

            return (
              <button
                key={tx.id}
                type="button"
                className={`csv-transaction-card ${isSelected ? 'csv-transaction-card--selected' : ''}`}
                onClick={() => setSelectedId(tx.id)}
              >
                <span className="csv-transaction-main">
                  <span className="csv-payee">{tx.row.payee || tx.row.description || 'Unnamed transaction'}</span>
                  <span className="csv-desc">
                    {formatTxDate(tx.row.bookingDate)} · {tx.row.accountName}
                  </span>
                </span>
                <span className="csv-transaction-side">
                  <span className={`num ${tx.row.amount >= 0 ? 'csv-amount--in' : 'csv-amount--out'}`}>
                    {tx.row.amount >= 0 ? '+' : ''}{formatCurrencyExact(tx.row.amount)}
                  </span>
                  <span className={needsDetails ? 'csv-row-status csv-row-status--needs' : 'csv-row-status'}>
                    {tx.settledPreviously ? 'Already settled' : needsDetails ? 'Needs detail' : CATEGORY_LABELS[category]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <section className="csv-allocation-panel" aria-label="Allocation editor">
          <div className="csv-allocation-header">
            <div>
              <p className="csv-kicker">Selected line</p>
              <h3>{selected.row.payee || selected.row.description || 'Unnamed transaction'}</h3>
              <p className="csv-desc">
                {formatTxDate(selected.row.bookingDate)} · {selected.row.accountName}
              </p>
            </div>
            <strong className={`num csv-allocation-amount ${selected.row.amount >= 0 ? 'csv-amount--in' : 'csv-amount--out'}`}>
              {selected.row.amount >= 0 ? '+' : ''}{formatCurrencyExact(selected.row.amount)}
            </strong>
          </div>

          <label className="csv-field-label" htmlFor="csv-category-select">Allocation</label>
          <select
            id="csv-category-select"
            className="csv-select csv-select--large"
            value={selectedCategory}
            onChange={e => handleCategoryChange(e.target.value as CategoryType)}
          >
            {(Object.keys(CATEGORY_LABELS) as CategoryType[]).map(c => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>

          {selectedCategory === 'set-aside-transfer' && (
            <>
              <label className="csv-field-label" htmlFor="csv-lockin-month">Counts as set-aside for</label>
              <select
                id="csv-lockin-month"
                className="csv-select csv-select--large"
                value={selected.lockInMonth ?? rowMonth}
                onChange={e =>
                  onUpdateCategory(selected.id, 'set-aside-transfer', {
                    lockInMonth: e.target.value as Month,
                  })
                }
              >
                {lockInMonthOptions.map(m => (
                  <option key={m} value={m}>{formatMonth(m)}</option>
                ))}
              </select>
              <p className="csv-helper-note">
                Use the month you are funding (often {formatMonth(currentMonth)} or the next month after income).
              </p>
            </>
          )}

          {selectedCategory === 'fixed-expense' && (
            <>
              <label className="csv-field-label" htmlFor="csv-fixed-select">Fixed expense</label>
              <select
                id="csv-fixed-select"
                className="csv-select csv-select--large"
                value={selected.confirmedLinkedExpenseId ?? selected.suggestion.linkedExpenseId ?? ''}
                onChange={e =>
                  onUpdateCategory(selected.id, 'fixed-expense', {
                    linkedExpenseId: e.target.value,
                  })
                }
              >
                <option value="">Choose fixed expense…</option>
                {hardFixed.map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </>
          )}

          {selectedCategory === 'envelope-spend' && (
            <>
              <label className="csv-field-label" htmlFor="csv-envelope-select">Envelope</label>
              <select
                id="csv-envelope-select"
                className="csv-select csv-select--large"
                value={selected.confirmedLinkedEnvelopeId ?? selected.suggestion.linkedEnvelopeId ?? ''}
                onChange={e =>
                  onUpdateCategory(selected.id, 'envelope-spend', {
                    linkedEnvelopeId: e.target.value,
                  })
                }
              >
                <option value="">Choose envelope…</option>
                {envelopes.map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </>
          )}

          {selectedCategory === 'planned-expense-settlement' && (
            <>
              <label className="csv-field-label" htmlFor="csv-planned-select">Planned expense</label>
              <select
                id="csv-planned-select"
                className="csv-select csv-select--large"
                value={selected.confirmedLinkedExpenseId ?? selected.suggestion.linkedExpenseId ?? ''}
                onChange={e =>
                  onUpdateCategory(selected.id, 'planned-expense-settlement', {
                    linkedExpenseId: e.target.value,
                  })
                }
              >
                <option value="">Choose planned expense…</option>
                {planned.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.name} · due {e.targetMonth}
                  </option>
                ))}
              </select>
            </>
          )}

          {selectedCategory === 'savings-contribution' && (
            <>
              <label className="csv-field-label" htmlFor="csv-savings-select">Savings goal</label>
              <select
                id="csv-savings-select"
                className="csv-select csv-select--large"
                value={selected.confirmedLinkedSavingsGoalId ?? selected.suggestion.linkedSavingsGoalId ?? ''}
                onChange={e =>
                  onUpdateCategory(selected.id, 'savings-contribution', {
                    linkedSavingsGoalId: e.target.value,
                  })
                }
              >
                <option value="">Choose savings goal…</option>
                {targetGoals.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </>
          )}

          {selectedNeedsDetails && (
            <p className="csv-error" role="alert">
              This allocation needs one more detail before you can continue.
            </p>
          )}
        </section>
      </div>

    </div>
  );
}
