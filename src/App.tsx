import { useMemo, useState } from 'react';
import { Backup } from './components/Backup';
import { EmptyStart, ExampleBanner } from './components/ExampleNotice';
import { ExpenseList, NEW_EXPENSE } from './components/ExpenseList';
import { LedgerColumns, LedgerRows } from './components/Ledger';
import { SyncPanel } from './components/SyncPanel';
import { ThisMonth } from './components/ThisMonth';
import { dayOfDate, monthOfDate } from './engine/months';
import { planSetAside } from './engine/plan';
import { envelopesAtMonthStart } from './engine/savingsLog';
import { DEFAULT_PAYDAY, paycheckMonthOf, paycheckRange, planningView } from './engine/timing';
import { MonthProgress } from './components/MonthProgress';
import { PaydaySettings } from './components/PaydaySettings';
import { useAccount } from './hooks/useAccount';
import { useEnvelopes } from './hooks/useEnvelopes';
import { useIsWide } from './hooks/useIsWide';
import { useSync } from './hooks/useSync';
import { sampleEnvelopes } from './sampleEnvelopes';
import { createLocalStore } from './storage/envelopeStore';
import { formatDayShort, ordinal } from './utils/format';
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
  // The real month (for things like "paid in"), and the paycheck you're living on.
  const calendarMonth = monthOfDate(new Date());
  const {
    envelopes: savedEnvelopes,
    isLoading,
    storageProblem,
    addEnvelope,
    updateEnvelope,
    removeEnvelope,
    restoreEnvelope,
    log,
    logSetAside,
    deleteLogEntry,
    settings,
    setPayday,
    data,
    replaceAll,
  } = useEnvelopes(store);
  const currentPaycheck = paycheckMonthOf(dayOfDate(new Date()), settings.payday);
  const hasPayday = settings.payday !== DEFAULT_PAYDAY;
  const range = paycheckRange(currentPaycheck, settings.payday);
  const paycheckLabel = hasPayday ? `${formatDayShort(range.from)} – ${formatDayShort(range.to)}` : undefined;
  const { account, linkError, sendLink, signOut } = useAccount();
  const sync = useSync({ account, data, isLoading, replaceAll });

  const isSyncing = ['synced', 'saving', 'unavailable'].includes(sync.status.kind);

  async function signOutOfThisDevice(): Promise<void> {
    await sync.forgetThisDevice();
    await signOut();
  }

  // Until the first real expense exists, show examples (never saved),
  // unless you've chosen to hide them.
  const [hideExamples, setHideExamples] = useState(loadHideExamples);
  const listIsEmpty = !isLoading && savedEnvelopes.length === 0;
  const showingExample = listIsEmpty && !hideExamples;
  const envelopes = useMemo(
    () => (showingExample ? sampleEnvelopes(calendarMonth) : savedEnvelopes),
    [showingExample, savedEnvelopes, calendarMonth],
  );
  // Examples have no log. Planning from the month's start keeps this month's
  // amount fixed while you log set-asides against it.
  const activeLog = useMemo(() => (showingExample ? [] : log), [showingExample, log]);
  const plan = useMemo(
    () =>
      planSetAside(
        envelopesAtMonthStart(planningView(envelopes, settings.payday), activeLog, currentPaycheck),
        currentPaycheck,
      ),
    [envelopes, activeLog, currentPaycheck, settings.payday],
  );

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
              <ThisMonth
                monthPlan={plan[0]}
                envelopes={envelopes}
                isExample={showingExample}
                paycheckLabel={paycheckLabel}
              >
                {!showingExample && plan[0] !== undefined && (
                  <MonthProgress
                    monthPlan={plan[0]}
                    envelopes={envelopes}
                    log={log}
                    today={dayOfDate(new Date())}
                    onLog={logSetAside}
                    onUndo={deleteLogEntry}
                  />
                )}
              </ThisMonth>
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
              {hasPayday && (
                <p className="field-hint ledger-note">
                  Each month here is a paycheck, paid around the {ordinal(settings.payday)}.
                </p>
              )}
              {layout === 'columns' ? (
                <LedgerColumns plan={plan} envelopes={envelopes} />
              ) : (
                <LedgerRows plan={plan} envelopes={envelopes} />
              )}
            </section>
          )}

          <ExpenseList
            envelopes={savedEnvelopes}
            currentMonth={calendarMonth}
            payday={settings.payday}
            onAdd={addEnvelope}
            onUpdate={updateEnvelope}
            onRemove={removeEnvelope}
            onRestore={restoreEnvelope}
            openForm={openForm}
            onOpenFormChange={setOpenForm}
          />

          <SyncPanel
            account={account}
            linkError={linkError}
            onSendLink={sendLink}
            onSignOut={signOutOfThisDevice}
            sync={sync}
          />

          <PaydaySettings payday={settings.payday} onChange={setPayday} />

          <Backup data={data} onRestore={replaceAll} isSyncing={isSyncing} />
        </main>
      )}
    </div>
  );
}
