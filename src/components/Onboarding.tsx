import { useState, useRef } from 'react';
import { runEngine } from '../engine/smoothing';
import { formatCurrency, getCurrentMonth } from '../utils/formatting';
import type { BudgetState, FixedExpense, Month, SavingsGoal } from '../engine/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  onComplete: (budget: BudgetState) => void;
  onImport:  (budget: BudgetState) => void;
}

type Step = 'start' | 'income' | 'fixed' | 'savings' | 'summary';

// A savings goal being drafted — same shape as SavingsGoal but without `id`
// and with amounts as strings (because they come from <input> elements).
type GoalDraft =
  | { mode: 'target';  name: string; targetAmount: string; currentAmount: string; targetDate: Month }
  | { mode: 'monthly'; name: string; monthlyAmount: string };

// ─── Fixed expense categories ─────────────────────────────────────────────────

const CATEGORIES = [
  {
    label: 'Housing',
    category: 'housing',
    suggestions: ['Rent', 'Electricity', 'Gas & Heating', 'Water', 'Internet'],
  },
  {
    label: 'Transport',
    category: 'transport',
    suggestions: ['Car insurance', 'Public transport', 'Fuel', 'Car loan'],
  },
  {
    label: 'Insurance',
    category: 'insurance',
    suggestions: ['Health insurance', 'Dental insurance', 'Life insurance', 'Liability'],
  },
  {
    label: 'Subscriptions',
    category: 'subscriptions',
    suggestions: ['Netflix', 'Spotify', 'Amazon Prime', 'Gym', 'Phone plan'],
  },
  {
    label: 'Other',
    category: 'other',
    suggestions: ['Phone contract', 'Loan repayment', 'Childcare'],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Onboarding({ onComplete, onImport }: Props) {
  const currentMonth = getCurrentMonth();

  // ── Wizard navigation state ──
  const [step, setStep] = useState<Step>('start');
  const [categoryIndex, setCategoryIndex] = useState(0);

  // ── Budget being built up across steps ──
  const [incomeStr, setIncomeStr]         = useState('');
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [savingsGoals, setSavingsGoals]   = useState<SavingsGoal[]>([]);

  // ── Fixed expense entry form (step 2) ──
  const [pendingName,       setPendingName]       = useState('');
  const [pendingAmount,     setPendingAmount]     = useState('');
  const [pendingIsEnvelope, setPendingIsEnvelope] = useState(false);
  const nameRef   = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  // ── Savings goal form (step 3) ──
  const [goalDraft, setGoalDraft] = useState<GoalDraft | null>(null);

  // ── Import ──
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Derived values ──
  const incomeNum = parseFloat(incomeStr) || 0;
  const fixedTotal = fixedExpenses.reduce((s, e) => s + e.amount, 0);

  // Run the engine on the draft budget to show the baseline free budget on step 4.
  const draftBudget: BudgetState = {
    income: incomeNum,
    fixedExpenses,
    plannedExpenses: [],
    savingsGoals,
    lockIns: [],
    unplannedExpenses: [],
    envelopeActualizations: [],
    plannedExpensePayments: [],
    plannedExpenseRecoveries: [],
    plannedExpenseSettlements: [],
    reconciledMonths: [],
    monthCarryAdjustments: [],
    incomeByMonth: {},
  };
  const engineResult = runEngine(draftBudget, currentMonth);
  const baselineFreeBudget = engineResult.months.find(m => m.month === currentMonth)?.freeBudget ?? 0;

  // ── Fixed expense helpers ──

  function addPendingExpense() {
    const name   = pendingName.trim();
    const amount = parseFloat(pendingAmount);
    if (!name || !(amount > 0)) return;
    const category = CATEGORIES[categoryIndex]?.category ?? 'other';
    setFixedExpenses(prev => [
      ...prev,
      { id: crypto.randomUUID(), name, amount, category, isEnvelope: pendingIsEnvelope, actualAmount: null },
    ]);
    setPendingName('');
    setPendingAmount('');
    setPendingIsEnvelope(false);
    nameRef.current?.focus();
  }

  function handleSuggestionClick(name: string) {
    setPendingName(name);
    // Defer focus so React has flushed the state update first.
    setTimeout(() => amountRef.current?.focus(), 0);
  }

  // ── Savings goal helpers ──

  function commitGoal() {
    if (!goalDraft) return;
    let goal: SavingsGoal;

    if (goalDraft.mode === 'target') {
      const target  = parseFloat(goalDraft.targetAmount);
      const current = parseFloat(goalDraft.currentAmount) || 0;
      if (!goalDraft.name || !(target > 0) || !goalDraft.targetDate) return;
      goal = {
        id: crypto.randomUUID(),
        name: goalDraft.name,
        mode: 'target',
        targetAmount: target,
        currentAmount: current,
        targetDate: goalDraft.targetDate,
      };
    } else {
      const amount = parseFloat(goalDraft.monthlyAmount);
      if (!goalDraft.name || !(amount > 0)) return;
      goal = {
        id: crypto.randomUUID(),
        name: goalDraft.name,
        mode: 'monthly',
        monthlyAmount: amount,
      };
    }

    setSavingsGoals(prev => [...prev, goal]);
    setGoalDraft(null);
  }

  // ── Import helper ──

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as BudgetState;
        if (typeof parsed.income !== 'number') throw new Error('Invalid file');
        onImport(parsed);
      } catch {
        alert('Could not read the backup file. Make sure it is a valid BudgetFlow export.');
      }
    };
    reader.readAsText(file);
  }

  // ── Finish onboarding ──

  function finish() {
    onComplete({
      income: incomeNum,
      fixedExpenses,
      plannedExpenses: [],
      savingsGoals,
      lockIns: [],
      unplannedExpenses: [],
      envelopeActualizations: [],
      plannedExpensePayments: [],
    plannedExpenseRecoveries: [],
      plannedExpenseSettlements: [],
      reconciledMonths: [],
      monthCarryAdjustments: [],
    });
  }

  const cat = CATEGORIES[categoryIndex];

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="onboarding">

      {/* ── Screen 0: Start ──────────────────────────────────────────────────── */}
      {step === 'start' && (
        <div className="ob-screen">
          <div className="ob-content">
            <h1 className="ob-logo">BudgetFlow</h1>
            <p className="ob-subtitle">
              Know exactly how much you can freely spend — every month,<br />
              without compromising a single future expense.
            </p>
            <div className="ob-start-actions">
              <button className="btn btn-primary" onClick={() => setStep('income')}>
                Start fresh
              </button>
              <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
                Import backup
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
        </div>
      )}

      {/* ── Step 1: Income ───────────────────────────────────────────────────── */}
      {step === 'income' && (
        <div className="ob-screen">
          <div className="ob-content">
            <p className="ob-step-label">Step 1 of 4</p>
            <h2 className="ob-question">What's your monthly net income?</h2>
            <p className="ob-hint">After tax, all sources combined.</p>
            <div className="input-prefix ob-income-input">
              <input
                className="input"
                type="number"
                min="0"
                placeholder="3000"
                value={incomeStr}
                onChange={e => setIncomeStr(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && incomeNum > 0) setStep('fixed'); }}
                autoFocus
              />
            </div>
            <div className="ob-nav">
              <button className="btn btn-ghost" onClick={() => setStep('start')}>← Back</button>
              <button
                className="btn btn-primary"
                disabled={incomeNum <= 0}
                onClick={() => setStep('fixed')}
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: Fixed expenses ───────────────────────────────────────────── */}
      {step === 'fixed' && (
        <div className="ob-screen">
          <div className="ob-content ob-content--wide">
            <p className="ob-step-label">Step 2 of 4</p>
            <h2 className="ob-question">What are your fixed monthly expenses?</h2>
            <p className="ob-hint">
              Click a suggestion to pre-fill the name, then enter the amount.
            </p>

            {/* Category tabs */}
            <div className="ob-category-tabs">
              {CATEGORIES.map((c, i) => (
                <button
                  key={c.label}
                  className={`ob-tab ${i === categoryIndex ? 'ob-tab--active' : ''}`}
                  onClick={() => setCategoryIndex(i)}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Suggestion chips */}
            <div className="ob-chips">
              {cat.suggestions.map(name => (
                <button
                  key={name}
                  className="ob-chip"
                  onClick={() => handleSuggestionClick(name)}
                >
                  + {name}
                </button>
              ))}
            </div>

            {/* Entry row: name + amount + Add button */}
            <div className="ob-entry-row">
              <input
                ref={nameRef}
                className="input"
                placeholder="Name"
                value={pendingName}
                onChange={e => setPendingName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') amountRef.current?.focus(); }}
              />
              <div className="input-prefix">
                <input
                  ref={amountRef}
                  className="input"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={pendingAmount}
                  onChange={e => setPendingAmount(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addPendingExpense(); }}
                />
              </div>
              <button className="btn btn-secondary" onClick={addPendingExpense}>Add</button>
            </div>
            <label className="envelope-toggle ob-envelope-toggle">
              <input
                type="checkbox"
                checked={pendingIsEnvelope}
                onChange={e => setPendingIsEnvelope(e.target.checked)}
              />
              <span>Budget envelope (flexible spending budget)</span>
            </label>

            {/* Running list of all added fixed expenses */}
            {fixedExpenses.length > 0 && (
              <ul className="ob-expense-list">
                {fixedExpenses.map(e => (
                  <li key={e.id} className="ob-expense-item">
                    <span className="ob-expense-name">
                      {e.name}
                      {e.isEnvelope && <span className="envelope-badge">~ flexible</span>}
                    </span>
                    <span className="ob-expense-amount num">{formatCurrency(e.amount)}</span>
                    <button
                      className="ob-expense-delete"
                      onClick={() => setFixedExpenses(prev => prev.filter(x => x.id !== e.id))}
                      title="Remove"
                    >
                      ×
                    </button>
                  </li>
                ))}
                <li className="ob-expense-total">
                  <span>Total fixed</span>
                  <span className="num">{formatCurrency(fixedTotal)}</span>
                </li>
              </ul>
            )}

            <div className="ob-nav">
              <button className="btn btn-ghost" onClick={() => setStep('income')}>← Back</button>
              <button className="btn btn-primary" onClick={() => setStep('savings')}>
                {fixedExpenses.length === 0 ? 'Skip →' : 'Done →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: Savings goals ────────────────────────────────────────────── */}
      {step === 'savings' && (
        <div className="ob-screen">
          <div className="ob-content">
            <p className="ob-step-label">Step 3 of 4</p>
            <h2 className="ob-question">Any savings goals?</h2>

            {/* Existing goals */}
            {savingsGoals.length > 0 && (
              <ul className="ob-expense-list">
                {savingsGoals.map(g => (
                  <li key={g.id} className="ob-expense-item">
                    <span className="ob-expense-name">{g.name}</span>
                    <span className="ob-expense-amount">
                      {g.mode === 'monthly'
                        ? `${formatCurrency(g.monthlyAmount)}/mo`
                        : `→ ${formatCurrency(g.targetAmount)}`}
                    </span>
                    <button
                      className="ob-expense-delete"
                      onClick={() => setSavingsGoals(prev => prev.filter(x => x.id !== g.id))}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Add goal type selector */}
            {!goalDraft && (
              <div className="ob-goal-type-row">
                <button
                  className="btn btn-secondary"
                  onClick={() => setGoalDraft({ mode: 'target', name: '', targetAmount: '', currentAmount: '', targetDate: '' })}
                >
                  Set a target
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setGoalDraft({ mode: 'monthly', name: '', monthlyAmount: '' })}
                >
                  Save monthly
                </button>
              </div>
            )}

            {/* Mode A goal form */}
            {goalDraft?.mode === 'target' && (
              <div className="ob-goal-form card">
                <div className="input-group">
                  <label className="input-label">Goal name</label>
                  <input
                    className="input"
                    placeholder="e.g. Holiday fund"
                    value={goalDraft.name}
                    onChange={e => setGoalDraft({ ...goalDraft, name: e.target.value })}
                    autoFocus
                  />
                </div>
                <div className="ob-goal-row">
                  <div className="input-group">
                    <label className="input-label">Target amount</label>
                    <div className="input-prefix">
                      <input
                        className="input"
                        type="number"
                        min="0"
                        placeholder="5000"
                        value={goalDraft.targetAmount}
                        onChange={e => setGoalDraft({ ...goalDraft, targetAmount: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="input-group">
                    <label className="input-label">Already saved</label>
                    <div className="input-prefix">
                      <input
                        className="input"
                        type="number"
                        min="0"
                        placeholder="0"
                        value={goalDraft.currentAmount}
                        onChange={e => setGoalDraft({ ...goalDraft, currentAmount: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <div className="input-group">
                  <label className="input-label">Target month</label>
                  <input
                    className="input"
                    type="month"
                    min={currentMonth}
                    value={goalDraft.targetDate}
                    onChange={e => setGoalDraft({ ...goalDraft, targetDate: e.target.value })}
                  />
                </div>
                <div className="modal-actions">
                  <button className="btn btn-ghost" onClick={() => setGoalDraft(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={commitGoal}>Add goal</button>
                </div>
              </div>
            )}

            {/* Mode B goal form */}
            {goalDraft?.mode === 'monthly' && (
              <div className="ob-goal-form card">
                <div className="input-group">
                  <label className="input-label">Goal name</label>
                  <input
                    className="input"
                    placeholder="e.g. Emergency fund"
                    value={goalDraft.name}
                    onChange={e => setGoalDraft({ ...goalDraft, name: e.target.value })}
                    autoFocus
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">Monthly amount</label>
                  <div className="input-prefix">
                    <input
                      className="input"
                      type="number"
                      min="0"
                      placeholder="200"
                      value={goalDraft.monthlyAmount}
                      onChange={e => setGoalDraft({ ...goalDraft, monthlyAmount: e.target.value })}
                    />
                  </div>
                </div>
                <div className="modal-actions">
                  <button className="btn btn-ghost" onClick={() => setGoalDraft(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={commitGoal}>Add goal</button>
                </div>
              </div>
            )}

            <div className="ob-nav">
              <button className="btn btn-ghost" onClick={() => setStep('fixed')}>← Back</button>
              <button className="btn btn-primary" onClick={() => setStep('summary')}>
                {savingsGoals.length === 0 ? 'Skip →' : 'Done →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 4: Summary ──────────────────────────────────────────────────── */}
      {step === 'summary' && (
        <div className="ob-screen">
          <div className="ob-content">
            <p className="ob-step-label">Step 4 of 4</p>
            <h2 className="ob-question">Your baseline free budget</h2>

            <div className="ob-summary card">
              <div className="ob-summary-row">
                <span>Monthly income</span>
                <span className="num income">{formatCurrency(incomeNum)}</span>
              </div>
              {fixedTotal > 0 && (
                <div className="ob-summary-row">
                  <span>Fixed expenses</span>
                  <span className="num critical">− {formatCurrency(fixedTotal)}</span>
                </div>
              )}
              {engineResult.modeBSavingsTotal > 0 && (
                <div className="ob-summary-row">
                  <span>Monthly savings</span>
                  <span className="num savings">
                    − {formatCurrency(engineResult.modeBSavingsTotal)}
                  </span>
                </div>
              )}
              <hr className="divider" />
              <div className="ob-summary-row ob-summary-row--total">
                <span>Free budget</span>
                <span className={`num ${
                  baselineFreeBudget > 300 ? 'healthy' :
                  baselineFreeBudget > 150 ? 'tight' : 'critical'
                }`}>
                  {formatCurrency(baselineFreeBudget)}/mo
                </span>
              </div>
            </div>

            <p className="ob-hint" style={{ textAlign: 'center' }}>
              {baselineFreeBudget > 0
                ? 'This is yours to spend freely — before any planned expenses.'
                : 'Your expenses exceed your income. You can adjust everything in settings.'}
            </p>

            <div className="ob-nav">
              <button className="btn btn-ghost" onClick={() => setStep('savings')}>← Back</button>
              <button className="btn btn-primary" onClick={finish}>Let's go →</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
