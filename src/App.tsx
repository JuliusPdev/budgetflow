import { useMemo, useState } from 'react';
import { Backup } from './components/Backup';
import { EmptyStart, ExampleBanner } from './components/ExampleNotice';
import { ExpenseList, NEW_EXPENSE } from './components/ExpenseList';
import { LedgerColumns, LedgerRows } from './components/Ledger';
import { ThisMonth } from './components/ThisMonth';
import { monthOfDate } from './engine/months';
import { planSetAside } from './engine/plan';
import { useEnvelopes } from './hooks/useEnvelopes';
import { useIsWide } from './hooks/useIsWide';
import { sampleEnvelopes } from './sampleEnvelopes';
import { createLocalStore } from './storage/envelopeStore';
import { loadHideExamples, saveHideExamples } from './storage/preferences';

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
    replaceAllEnvelopes,
  } = useEnvelopes(store);

  // Until the first real expense exists, show examples (never saved),
  // unless you've chosen to hide them.
  const [hideExamples, setHideExamples] = useState(loadHideExamples);
  const listIsEmpty = !isLoading && savedEnvelopes.length === 0;
  const showingExample = listIsEmpty && !hideExamples;
  const envelopes = useMemo(
    () => (showingExample ? sampleEnvelopes(currentMonth) : savedEnvelopes),
    [showingExample, savedEnvelopes, currentMonth],
  );
  const plan = useMemo(() => planSetAside(envelopes, currentMonth), [envelopes, currentMonth]);

  // Columns suit a wide screen, rows a phone — unless the user picks one.
  const isWide = useIsWide();
  const [layoutChoice, setLayoutChoice] = useState<LayoutChoice>('auto');
  const layout = layoutChoice === 'auto' ? (isWide ? 'columns' : 'rows') : layoutChoice;

  // Which expense form is open. Kept here, not in the list, because the
  // "Add your first expense" buttons at the top need to open it too.
  const [openForm, setOpenForm] = useState<string | null>(null);

  function changeHideExamples(hide: boolean): void {
    setHideExamples(hide);
    saveHideExamples(hide);
  }

  function openAddForm(): void {
    // The form focuses its first field when it opens, which scrolls it into view.
    setOpenForm(NEW_EXPENSE);
  }

  return (
    <div className="page">
      <header className="masthead">
        <span className="wordmark">BudgetFlow</span>
      </header>

      {storageProblem && (
        <p className="storage-warning" role="alert">
          Your browser isn't letting BudgetFlow save. Changes will be lost when you close this page.
        </p>
      )}

      {!isLoading && (
        <main className="content">
          <div className="top-stack">
            {showingExample && (
              <ExampleBanner onAddFirst={openAddForm} onHide={() => changeHideExamples(true)} />
            )}

            {listIsEmpty && hideExamples ? (
              <EmptyStart onAddFirst={openAddForm} onShowExamples={() => changeHideExamples(false)} />
            ) : (
              <ThisMonth monthPlan={plan[0]} envelopes={envelopes} isExample={showingExample} />
            )}
          </div>

          {plan.length > 0 && (
            <section className="ledger" aria-labelledby="ledger-title">
              <div className="ledger-heading">
                <h2 id="ledger-title" className="ledger-title">
                  What's coming
                  {showingExample && <span className="example-tag">Example</span>}
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
            openForm={openForm}
            onOpenFormChange={setOpenForm}
          />

          <Backup envelopes={savedEnvelopes} onRestore={replaceAllEnvelopes} />
        </main>
      )}
    </div>
  );
}
