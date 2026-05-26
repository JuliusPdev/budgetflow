import { useState } from 'react';
import { formatCurrency } from '../utils/formatting';
import type { BudgetState, FixedExpense } from '../engine/types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  budget:             BudgetState;
  setIncome:          (amount: number) => void;
  addFixedExpense:    (e: Omit<FixedExpense, 'id' | 'actualAmount'>) => void;
  updateFixedExpense: (id: string, changes: Partial<Omit<FixedExpense, 'id'>>) => void;
  removeFixedExpense: (id: string) => void;
  onStartReconciliation?: () => void;
  onResetWorkingData: () => void;
  onClose:            () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Settings({
  budget,
  setIncome,
  addFixedExpense,
  updateFixedExpense,
  removeFixedExpense,
  onStartReconciliation,
  onResetWorkingData,
  onClose,
}: Props) {

  // ── Income editing ──
  const [incomeStr, setIncomeStr] = useState(String(budget.income));
  const incomeNum = parseFloat(incomeStr) || 0;

  function commitIncome() {
    if (incomeNum > 0 && incomeNum !== budget.income) {
      setIncome(incomeNum);
    }
  }

  // ── Add-expense form ──
  const [addName,       setAddName]       = useState('');
  const [addAmountStr,  setAddAmountStr]  = useState('');
  const [addIsEnvelope, setAddIsEnvelope] = useState(false);
  const addAmount = parseFloat(addAmountStr) || 0;

  function submitAdd() {
    if (!addName.trim() || addAmount <= 0) return;
    addFixedExpense({
      name:       addName.trim(),
      amount:     addAmount,
      category:   'other',
      isEnvelope: addIsEnvelope,
    });
    setAddName('');
    setAddAmountStr('');
    setAddIsEnvelope(false);
  }

  // ── Inline editing of existing expenses ──
  const [editingId,        setEditingId]        = useState<string | null>(null);
  const [editName,         setEditName]         = useState('');
  const [editAmountStr,    setEditAmountStr]    = useState('');
  const [editIsEnvelope,   setEditIsEnvelope]   = useState(false);

  function startEdit(e: FixedExpense) {
    setEditingId(e.id);
    setEditName(e.name);
    setEditAmountStr(String(e.amount));
    setEditIsEnvelope(e.isEnvelope);
  }

  function commitEdit(id: string) {
    const amount = parseFloat(editAmountStr);
    if (editName.trim() && amount > 0) {
      updateFixedExpense(id, {
        name:       editName.trim(),
        amount,
        isEnvelope: editIsEnvelope,
      });
    }
    setEditingId(null);
  }

  function handleResetWorkingData() {
    const confirmed = window.confirm(
      'Reset all testing and reconciliation data? This keeps income, fixed expenses, envelopes, and savings goals, but clears planned expenses, CSV uploads, reconciled months, carry-over, settlements, lock-ins, and spending records.'
    );
    if (!confirmed) return;
    onResetWorkingData();
    onClose();
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--settings" onClick={e => e.stopPropagation()}>

        <h2 className="modal-title">Settings</h2>

        {onStartReconciliation && (
          <section className="settings-section">
            <h3 className="settings-section-title">Month-end reconciliation</h3>
            <p className="settings-hint">
              Import your C24 bank CSV to reconcile a completed month.
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { onStartReconciliation(); onClose(); }}
            >
              Import bank CSV…
            </button>
          </section>
        )}

        <section className="settings-section">
          <h3 className="settings-section-title">Testing reset</h3>
          <p className="settings-hint">
            Keep your onboarding setup, but clear all planned/test/reconciliation data and uploaded CSV sessions.
          </p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleResetWorkingData}
          >
            Reset test data
          </button>
        </section>

        {/* ── Income ─────────────────────────────────────────────────── */}
        <section className="settings-section">
          <h3 className="settings-section-title">Income</h3>
          <p className="settings-hint">
            Default monthly income for months you have not settled via CSV yet. Confirmed amounts from import are stored per month.
          </p>
          <div className="settings-income-row">
            <div className="input-prefix settings-income-input">
              <input
                className="input"
                type="number"
                min="0"
                value={incomeStr}
                onChange={e => setIncomeStr(e.target.value)}
                onBlur={commitIncome}
                onKeyDown={e => { if (e.key === 'Enter') { commitIncome(); (e.target as HTMLInputElement).blur(); } }}
              />
            </div>
            <span className="settings-income-label">/ month</span>
          </div>
        </section>

        {/* ── Fixed expenses ──────────────────────────────────────────── */}
        <section className="settings-section">
          <h3 className="settings-section-title">Fixed expenses</h3>

          {/* Explanation of envelopes */}
          <p className="settings-hint">
            Hard fixed expenses (rent, insurance) are exact amounts that don't change.
            Budget envelopes (food, transport) are monthly spending budgets — you decide
            how much you want to allow yourself to spend in that category.
          </p>

          {/* Existing expense list */}
          {budget.fixedExpenses.length > 0 && (
            <ul className="settings-expense-list">
              {budget.fixedExpenses.map(e => (
                <li key={e.id} className="settings-expense-item">
                  {editingId === e.id ? (
                    // ── Edit mode ──
                    <div className="settings-edit-form">
                      <div className="settings-edit-inputs">
                        <input
                          className="input"
                          value={editName}
                          onChange={ev => setEditName(ev.target.value)}
                          onKeyDown={ev => { if (ev.key === 'Enter') commitEdit(e.id); if (ev.key === 'Escape') setEditingId(null); }}
                          autoFocus
                        />
                        <div className="input-prefix">
                          <input
                            className="input"
                            type="number"
                            min="0"
                            value={editAmountStr}
                            onChange={ev => setEditAmountStr(ev.target.value)}
                            onKeyDown={ev => { if (ev.key === 'Enter') commitEdit(e.id); if (ev.key === 'Escape') setEditingId(null); }}
                          />
                        </div>
                      </div>
                      <label className="envelope-toggle">
                        <input
                          type="checkbox"
                          checked={editIsEnvelope}
                          onChange={ev => setEditIsEnvelope(ev.target.checked)}
                        />
                        <span>Budget envelope</span>
                      </label>
                      <div className="settings-edit-actions">
                        <button className="mc-action-btn" onClick={() => commitEdit(e.id)}>✓</button>
                        <button className="mc-action-btn" onClick={() => setEditingId(null)}>✕</button>
                      </div>
                    </div>
                  ) : (
                    // ── Display mode ──
                    <div
                      className="settings-expense-row"
                      onClick={() => startEdit(e)}
                      title="Click to edit"
                    >
                      <div className="settings-expense-info">
                        <span className="settings-expense-name">{e.name}</span>
                        {e.isEnvelope && <span className="envelope-badge">~ flexible</span>}
                      </div>
                      <span className="settings-expense-amount num">
                        {formatCurrency(e.amount)}
                      </span>
                      <button
                        className="mc-delete-btn"
                        title="Remove"
                        onClick={ev => { ev.stopPropagation(); removeFixedExpense(e.id); }}
                      >×</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Add new expense form */}
          <div className="settings-add-form">
            <div className="settings-add-inputs">
              <input
                className="input"
                placeholder="Expense name"
                value={addName}
                onChange={e => setAddName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitAdd(); }}
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
            <label className="envelope-toggle">
              <input
                type="checkbox"
                checked={addIsEnvelope}
                onChange={e => setAddIsEnvelope(e.target.checked)}
              />
              <span>Budget envelope</span>
            </label>
            <button
              className="btn btn-secondary btn-sm"
              onClick={submitAdd}
              disabled={!addName.trim() || addAmount <= 0}
            >
              Add
            </button>
          </div>
        </section>

        {/* ── Close button ─────────────────────────────────────────────── */}
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>

      </div>
    </div>
  );
}
