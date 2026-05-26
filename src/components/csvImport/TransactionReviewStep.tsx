import { useMemo, useState } from 'react';
import { formatCurrencyExact } from '../../utils/formatting';
import {
  GENERAL_ALLOCATION_CATEGORIES,
  allocationDisplayLabel,
  allocationSelectValue,
  buildAllocationFilterOptions,
  envelopeAllocationValue,
  filterReviewTransactions,
  fixedAllocationValue,
  isReviewFilterActive,
} from '../../utils/filterReviewTransactions';
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

const ENVELOPE_VALUE_PREFIX = 'envelope:';
const FIXED_VALUE_PREFIX = 'fixed:';

function allocationPlaceholderLabel(tx: ReviewableTransaction): string {
  const category = tx.confirmedCategory ?? tx.suggestion.category;
  if (category === 'envelope-spend') return 'Pick an envelope…';
  if (category === 'fixed-expense') return 'Pick a fixed expense…';
  return 'Pick allocation…';
}

function applyAllocationChange(
  value: string,
  tx: ReviewableTransaction,
  onUpdateCategory: Props['onUpdateCategory'],
): void {
  if (value.startsWith(ENVELOPE_VALUE_PREFIX)) {
    onUpdateCategory(tx.id, 'envelope-spend', {
      linkedEnvelopeId: value.slice(ENVELOPE_VALUE_PREFIX.length),
    });
    return;
  }
  if (value.startsWith(FIXED_VALUE_PREFIX)) {
    onUpdateCategory(tx.id, 'fixed-expense', {
      linkedExpenseId: value.slice(FIXED_VALUE_PREFIX.length),
    });
    return;
  }
  onUpdateCategory(tx.id, value as CategoryType, {
    lockInMonth:
      value === 'set-aside-transfer' ? tx.lockInMonth : undefined,
  });
}

interface Props {
  transactions: ReviewableTransaction[];
  budget: BudgetState;
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

interface DetailCellProps {
  tx: ReviewableTransaction;
  budget: BudgetState;
  lockInMonthOptions: Month[];
  onUpdateCategory: Props['onUpdateCategory'];
}

function DetailCell({
  tx,
  budget,
  lockInMonthOptions,
  onUpdateCategory,
}: DetailCellProps) {
  if (tx.settledPreviously) {
    return <span className="csv-spreadsheet-muted">Settled</span>;
  }

  const category = tx.confirmedCategory ?? tx.suggestion.category;
  const rowMonth = bookingMonth(tx.row.bookingDate);
  const planned = budget.plannedExpenses;
  const targetGoals = budget.savingsGoals.filter(
    (g): g is Extract<typeof g, { mode: 'target' }> => g.mode === 'target',
  );
  const selectClass = 'csv-select csv-spreadsheet-select';

  switch (category) {
    case 'set-aside-transfer':
      return (
        <select
          id={`csv-lockin-${tx.id}`}
          className={selectClass}
          aria-label={`Lock-in month for pot transfer, ${tx.row.payee || 'transaction'}`}
          value={tx.lockInMonth ?? rowMonth}
          onChange={e =>
            onUpdateCategory(tx.id, 'set-aside-transfer', {
              lockInMonth: e.target.value as Month,
            })
          }
        >
          {lockInMonthOptions.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      );
    case 'fixed-expense':
    case 'envelope-spend':
      return <span className="csv-spreadsheet-muted">—</span>;
    case 'planned-expense-settlement':
      return (
        <select
          id={`csv-planned-${tx.id}`}
          className={selectClass}
          aria-label="Planned expense"
          value={tx.confirmedLinkedExpenseId ?? tx.suggestion.linkedExpenseId ?? ''}
          onChange={e =>
            onUpdateCategory(tx.id, 'planned-expense-settlement', {
              linkedExpenseId: e.target.value,
            })
          }
        >
          <option value="">Choose…</option>
          {planned.map(e => (
            <option key={e.id} value={e.id}>
              {e.name} · {e.targetMonth}
            </option>
          ))}
        </select>
      );
    case 'savings-contribution':
      return (
        <select
          id={`csv-savings-${tx.id}`}
          className={selectClass}
          aria-label="Savings goal"
          value={tx.confirmedLinkedSavingsGoalId ?? tx.suggestion.linkedSavingsGoalId ?? ''}
          onChange={e =>
            onUpdateCategory(tx.id, 'savings-contribution', {
              linkedSavingsGoalId: e.target.value,
            })
          }
        >
          <option value="">Choose…</option>
          {targetGoals.map(g => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      );
    default:
      return (
        <span className="csv-spreadsheet-muted">
          {category === 'income' ? '—' : '—'}
        </span>
      );
  }
}

export default function TransactionReviewStep({
  transactions,
  budget,
  lockInMonthOptions,
  onUpdateCategory,
  onEditMapping,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const [filterPayee, setFilterPayee] = useState('');
  const [filterReference, setFilterReference] = useState('');
  const [filterAllocation, setFilterAllocation] = useState('');
  const [filterStatus, setFilterStatus] = useState<
    'all' | 'settled' | 'needs-detail' | 'ok'
  >('all');
  const { newCount, settledCount } = countNewTransactions(transactions);
  const needsDetailCount = transactions.filter(
    t => !t.settledPreviously && transactionNeedsDetails(t),
  ).length;
  const ready = allTransactionsReady(transactions);
  const hasPotTransfer = transactions.some(t => {
    if (t.settledPreviously) return false;
    const category = t.confirmedCategory ?? t.suggestion.category;
    return category === 'set-aside-transfer';
  });
  const envelopes = budget.fixedExpenses.filter(e => e.isEnvelope);
  const hardFixed = budget.fixedExpenses.filter(e => !e.isEnvelope);
  const totalCount = transactions.length;
  const columnFilters = useMemo(
    () => ({
      account: filterAccount || undefined,
      payee: filterPayee || undefined,
      reference: filterReference || undefined,
      allocation: filterAllocation || undefined,
      status: filterStatus,
    }),
    [filterAccount, filterPayee, filterReference, filterAllocation, filterStatus],
  );
  const uniqueAccountNames = useMemo(() => {
    const names = new Set(
      transactions.map(t => t.row.accountName).filter(Boolean),
    );
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [transactions]);
  const allocationFilterOptions = useMemo(
    () => buildAllocationFilterOptions(budget),
    [budget],
  );
  const visibleTransactions = useMemo(
    () =>
      filterReviewTransactions(
        transactions,
        searchQuery,
        budget,
        columnFilters,
      ),
    [transactions, searchQuery, budget, columnFilters],
  );
  const filtersActive = isReviewFilterActive(searchQuery, columnFilters);
  const visibleCount = visibleTransactions.length;

  if (transactions.length === 0) {
    return (
      <div className="csv-step">
        <p className="csv-step-intro">No transactions in this period.</p>
      </div>
    );
  }

  return (
    <div className="csv-step csv-step--spreadsheet">
      <div className="csv-review-toolbar csv-review-toolbar--desktop">
        <div>
          <span className="csv-progress">
            {newCount} new · {settledCount} already settled
          </span>
          <span
            className={`csv-ready-state ${ready ? 'csv-ready-state--ready' : 'csv-ready-state--needs-work'}`}
          >
            {ready ? 'Ready to continue' : `${needsDetailCount} need details`}
          </span>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onEditMapping}>
          Edit mapping
        </button>
      </div>

      <div className="csv-review-search">
        <label className="csv-review-search-label" htmlFor="csv-review-search">
          Search transactions
        </label>
        <input
          id="csv-review-search"
          type="search"
          className="csv-review-search-input"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search payee, Betreff, description, account, amount…"
          autoComplete="off"
          spellCheck={false}
        />
        {filtersActive && (
          <p className="csv-review-search-hint" aria-live="polite">
            Showing {visibleCount} of {totalCount} transaction{totalCount === 1 ? '' : 's'}
          </p>
        )}
      </div>

      <p className="csv-step-intro csv-spreadsheet-hint">
        Each row is one bank line. Use the header row to see what each column means. Pick allocation and detail per row.
      </p>

      <div className="csv-spreadsheet-wrap" role="region" aria-label="Transaction spreadsheet">
        <table className="csv-spreadsheet">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Account</th>
              <th scope="col">Payee / description</th>
              <th scope="col">Betreff</th>
              <th scope="col" className="csv-spreadsheet-th--amount">Amount</th>
              <th scope="col">Status</th>
              <th scope="col">Allocation</th>
              <th scope="col">Detail / lock-in month</th>
            </tr>
            <tr className="csv-spreadsheet-filter-row">
              <th scope="col" aria-hidden="true" />
              <th scope="col">
                <label className="csv-spreadsheet-filter-label" htmlFor="csv-filter-account">
                  Filter by account
                </label>
                <select
                  id="csv-filter-account"
                  className="csv-spreadsheet-filter-control"
                  value={filterAccount}
                  onChange={e => setFilterAccount(e.target.value)}
                >
                  <option value="">All accounts</option>
                  {uniqueAccountNames.map(name => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </th>
              <th scope="col">
                <label className="csv-spreadsheet-filter-label" htmlFor="csv-filter-payee">
                  Filter by payee
                </label>
                <input
                  id="csv-filter-payee"
                  type="search"
                  className="csv-spreadsheet-filter-control"
                  value={filterPayee}
                  onChange={e => setFilterPayee(e.target.value)}
                  placeholder="Contains…"
                  autoComplete="off"
                  spellCheck={false}
                />
              </th>
              <th scope="col">
                <label className="csv-spreadsheet-filter-label" htmlFor="csv-filter-reference">
                  Filter by Betreff
                </label>
                <input
                  id="csv-filter-reference"
                  type="search"
                  className="csv-spreadsheet-filter-control"
                  value={filterReference}
                  onChange={e => setFilterReference(e.target.value)}
                  placeholder="Contains…"
                  autoComplete="off"
                  spellCheck={false}
                />
              </th>
              <th scope="col" className="csv-spreadsheet-th--amount" aria-hidden="true" />
              <th scope="col">
                <label className="csv-spreadsheet-filter-label" htmlFor="csv-filter-status">
                  Filter by status
                </label>
                <select
                  id="csv-filter-status"
                  className="csv-spreadsheet-filter-control"
                  value={filterStatus}
                  onChange={e =>
                    setFilterStatus(
                      e.target.value as
                        | 'all'
                        | 'settled'
                        | 'needs-detail'
                        | 'ok',
                    )
                  }
                >
                  <option value="all">All statuses</option>
                  <option value="needs-detail">Needs detail</option>
                  <option value="settled">Settled</option>
                  <option value="ok">OK</option>
                </select>
              </th>
              <th scope="col">
                <label className="csv-spreadsheet-filter-label" htmlFor="csv-filter-allocation">
                  Filter by allocation
                </label>
                <select
                  id="csv-filter-allocation"
                  className="csv-spreadsheet-filter-control"
                  value={filterAllocation}
                  onChange={e => setFilterAllocation(e.target.value)}
                >
                  <option value="">All allocations</option>
                  {allocationFilterOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </th>
              <th scope="col" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {visibleCount === 0 && filtersActive ? (
              <tr>
                <td colSpan={8} className="csv-spreadsheet-empty">
                  <p className="csv-spreadsheet-empty-title">No matching transactions</p>
                  <p className="csv-spreadsheet-empty-hint">
                    Try another payee, Betreff, account name, amount, or allocation label.
                  </p>
                </td>
              </tr>
            ) : null}
            {visibleTransactions.map(tx => {
              const needsDetails = !tx.settledPreviously && transactionNeedsDetails(tx);
              const rowClass = tx.settledPreviously
                ? 'csv-spreadsheet-row--settled'
                : needsDetails
                  ? 'csv-spreadsheet-row--needs'
                  : '';

              return (
                <tr key={tx.id} className={rowClass}>
                  <td className="csv-spreadsheet-cell--date">
                    {formatTxDate(tx.row.bookingDate)}
                  </td>
                  <td className="csv-spreadsheet-cell--account" title={tx.row.accountName}>
                    {tx.row.accountName}
                  </td>
                  <td className="csv-spreadsheet-cell--payee">
                    <span className="csv-payee">
                      {tx.row.payee || tx.row.description || 'Unnamed'}
                    </span>
                    {tx.row.description && tx.row.payee && (
                      <span className="csv-desc">{tx.row.description}</span>
                    )}
                  </td>
                  <td
                    className="csv-spreadsheet-cell--reference"
                    title={tx.row.reference ?? undefined}
                  >
                    {tx.row.reference ?? (
                      <span className="csv-spreadsheet-muted">—</span>
                    )}
                  </td>
                  <td className="csv-spreadsheet-cell--amount">
                    <span
                      className={`num ${tx.row.amount >= 0 ? 'csv-amount--in' : 'csv-amount--out'}`}
                    >
                      {tx.row.amount >= 0 ? '+' : ''}
                      {formatCurrencyExact(tx.row.amount)}
                    </span>
                  </td>
                  <td>
                    <span
                      className={
                        needsDetails
                          ? 'csv-row-status csv-row-status--needs'
                          : 'csv-row-status'
                      }
                    >
                      {tx.settledPreviously
                        ? 'Settled'
                        : needsDetails
                          ? 'Needs detail'
                          : 'OK'}
                    </span>
                  </td>
                  <td>
                    {tx.settledPreviously ? (
                      <span className="csv-spreadsheet-muted">
                        {allocationDisplayLabel(tx, budget)}
                      </span>
                    ) : (
                      <select
                        id={`csv-alloc-${tx.id}`}
                        className="csv-select csv-spreadsheet-select"
                        aria-label={`Allocation for ${tx.row.payee || 'transaction'}`}
                        value={allocationSelectValue(tx)}
                        onChange={e =>
                          applyAllocationChange(e.target.value, tx, onUpdateCategory)
                        }
                      >
                        {allocationSelectValue(tx) === '' && (
                          <option value="" disabled>
                            {allocationPlaceholderLabel(tx)}
                          </option>
                        )}
                        <optgroup label="General">
                          {GENERAL_ALLOCATION_CATEGORIES.map(c => (
                            <option key={c} value={c}>
                              {CATEGORY_LABELS[c]}
                            </option>
                          ))}
                        </optgroup>
                        {hardFixed.length > 0 && (
                          <optgroup label="Fixed expenses">
                            {hardFixed.map(e => (
                              <option
                                key={e.id}
                                value={fixedAllocationValue(e.id)}
                              >
                                {e.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {envelopes.length > 0 && (
                          <optgroup label="Envelopes">
                            {envelopes.map(e => (
                              <option
                                key={e.id}
                                value={envelopeAllocationValue(e.id)}
                              >
                                {e.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    )}
                  </td>
                  <td>
                    <DetailCell
                      tx={tx}
                      budget={budget}
                      lockInMonthOptions={lockInMonthOptions}
                      onUpdateCategory={onUpdateCategory}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasPotTransfer && (
        <p className="csv-step-intro csv-spreadsheet-hint">
          For pot transfers (set aside), use the last column to pick which month’s set-aside this transfer counts toward.
        </p>
      )}
    </div>
  );
}
