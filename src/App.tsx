import { useMemo, useState } from 'react';
import { ExpenseList } from './components/ExpenseList';
import { LedgerColumns, LedgerRows } from './components/Ledger';
import { ThisMonth } from './components/ThisMonth';
import { monthOfDate } from './engine/months';
import { planSetAside } from './engine/plan';
import { useEnvelopes } from './hooks/useEnvelopes';
import { useIsWide } from './hooks/useIsWide';
import { sampleEnvelopes } from './sampleEnvelopes';
import { createLocalStore } from './storage/envelopeStore';

type LayoutChoice = 'auto' | 'rows' | 'columns';

// Created once, outside App: a new store on every redraw would make the
// loading reflex think the store changed and reload endlessly.
// localStorage is only touched inside these functions, so a browser that
// blocks storage produces a catchable error instead of crashing on start.
const store = createLocalStore({
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
});

export default function App() {
  const currentMonth = monthOfDate(new Date());
  const {
    envelopes: savedEnvelopes,
    isLoading,
    storageProblem,
    addEnvelope,
    updateEnvelope,
    removeEnvelope,
    restoreEnvelope,
  } = useEnvelopes(store);

  // Until the first real expense exists, show examples — never saved.
  const showingExample = !isLoading && savedEnvelopes.length === 0;
  const envelopes = useMemo(
    () => (showingExample ? sampleEnvelopes(currentMonth) : savedEnvelopes),
    [showingExample, savedEnvelopes, currentMonth],
  );
  const plan = useMemo(() => planSetAside(envelopes, currentMonth), [envelopes, currentMonth]);

  // Columns suit a wide screen, rows a phone — unless the user picks one.
  const isWide = useIsWide();
  const [layoutChoice, setLayoutChoice] = useState<LayoutChoice>('auto');
  const layout = layoutChoice === 'auto' ? (isWide ? 'columns' : 'rows') : layoutChoice;

  return (
    <div className="page">
      <header className="masthead">
        <span className="wordmark">BudgetFlow</span>
        {showingExample && (
          <span className="sample-note">Example data · add your first expense below to replace it</span>
        )}
      </header>

      {storageProblem && (
        <p className="storage-warning" role="alert">
          Your browser isn't letting BudgetFlow save. Changes will be lost when you close this page.
        </p>
      )}

      {!isLoading && (
        <main className="content">
          <ThisMonth monthPlan={plan[0]} envelopes={envelopes} />

          {plan.length > 0 && (
            <section className="ledger" aria-labelledby="ledger-title">
              <div className="ledger-heading">
                <h2 id="ledger-title" className="ledger-title">
                  What's coming
                </h2>
                <div className="layout-toggle" role="group" aria-label="Ledger layout">
                  {(['rows', 'columns'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={layout === option}
                      onClick={() => setLayoutChoice(option)}
                    >
                      {option === 'rows' ? 'Rows' : 'Columns'}
                    </button>
                  ))}
                </div>
              </div>
              {layout === 'columns' ? (
                <LedgerColumns plan={plan} envelopes={envelopes} />
              ) : (
                <LedgerRows plan={plan} envelopes={envelopes} />
              )}
            </section>
          )}

          <ExpenseList
            envelopes={savedEnvelopes}
            currentMonth={currentMonth}
            onAdd={addEnvelope}
            onUpdate={updateEnvelope}
            onRemove={removeEnvelope}
            onRestore={restoreEnvelope}
          />
        </main>
      )}
    </div>
  );
}
