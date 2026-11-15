import { useMemo, useState } from 'react';
import { LedgerColumns, LedgerRows } from './components/Ledger';
import { ThisMonth } from './components/ThisMonth';
import { monthOfDate } from './engine/months';
import { planSetAside } from './engine/plan';
import { useIsWide } from './hooks/useIsWide';
import { sampleEnvelopes } from './sampleEnvelopes';

type LayoutChoice = 'auto' | 'rows' | 'columns';

export default function App() {
  const currentMonth = monthOfDate(new Date());
  const envelopes = useMemo(() => sampleEnvelopes(currentMonth), [currentMonth]);
  const plan = useMemo(() => planSetAside(envelopes, currentMonth), [envelopes, currentMonth]);

  // Columns suit a wide screen, rows a phone — unless the user picks one.
  const isWide = useIsWide();
  const [layoutChoice, setLayoutChoice] = useState<LayoutChoice>('auto');
  const layout = layoutChoice === 'auto' ? (isWide ? 'columns' : 'rows') : layoutChoice;

  return (
    <div className="page">
      <header className="masthead">
        <span className="wordmark">BudgetFlow</span>
        <span className="sample-note">Example data · your own expenses come next</span>
      </header>

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
      </main>
    </div>
  );
}
