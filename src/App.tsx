import { useState } from 'react';
import { useBudgetState } from './hooks/useBudgetState';
import { getCurrentMonth } from './utils/formatting';
import { addMonths } from './engine/smoothing';
import { DEV_MODE } from './utils/devMode';
import Onboarding from './components/Onboarding';
import DevToolbar from './components/DevToolbar';
import Settings from './components/Settings';
import V6Dashboard from './components/V6Dashboard';
import type { Month } from './engine/types';

function App() {
  // realMonth is today's actual calendar month — it never changes while the app is open.
  const realMonth: Month = getCurrentMonth();

  // simulatedMonth is what the app treats as "now". In normal use it starts
  // equal to realMonth. The DevToolbar's Next/Prev buttons change it.
  const [simulatedMonth, setSimulatedMonth] = useState<Month>(realMonth);

  // When DEV_MODE is on, the entire app runs as if it's simulatedMonth.
  // When DEV_MODE is off, it always uses the real calendar month.
  const currentMonth: Month = DEV_MODE ? simulatedMonth : realMonth;

  const state = useBudgetState(currentMonth);
  const [showSettings, setShowSettings] = useState(false);

  // Route to onboarding if the user hasn't set up their budget yet.
  // hasCompletedSetup is true as soon as income > 0.
  if (!state.hasCompletedSetup) {
    return (
      <Onboarding
        onComplete={state.completeOnboarding}
        onImport={state.importBudget}
      />
    );
  }

  return (
    <div className="app">

      {/* ── Dev toolbar (month simulation) — remove by setting DEV_MODE=false ── */}
      {DEV_MODE && (
        <DevToolbar
          simulatedMonth={simulatedMonth}
          realMonth={realMonth}
          onNext={() => setSimulatedMonth(m => addMonths(m, 1))}
          onPrev={() => setSimulatedMonth(m => addMonths(m, -1))}
          onReset={() => setSimulatedMonth(realMonth)}
        />
      )}

      <V6Dashboard
        engine={state.engine}
        budget={state.budget}
        currentMonth={state.currentMonth}
        canUndo={state.canUndo}
        onUndo={state.undo}
        onOpenSettings={() => setShowSettings(true)}
        addPlannedExpense={state.addPlannedExpense}
        updatePlannedExpense={state.updatePlannedExpense}
        removePlannedExpense={state.removePlannedExpense}
        lockIn={state.lockIn}
        freeUp={state.freeUp}
      />

      {/* ── Settings modal ──────────────────────────────────────────────────── */}
      {showSettings && (
        <Settings
          budget={state.budget}
          setIncome={state.setIncome}
          addFixedExpense={state.addFixedExpense}
          updateFixedExpense={state.updateFixedExpense}
          removeFixedExpense={state.removeFixedExpense}
          onResetWorkingData={state.resetWorkingData}
          onClose={() => setShowSettings(false)}
        />
      )}

    </div>
  );
}

export default App;
