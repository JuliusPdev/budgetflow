import { useMemo, useState } from 'react';
import { Backup } from './components/Backup';
import { EmptyStart, ExampleBanner } from './components/ExampleNotice';
import { ExpenseList, NEW_EXPENSE } from './components/ExpenseList';
import { LedgerColumns, LedgerRows } from './components/Ledger';
import { SyncPanel } from './components/SyncPanel';
import { ThisMonth } from './components/ThisMonth';
import { dayOfDate, monthOfDate } from './engine/months';
import { withShares } from './engine/pot';
import { potCents } from './engine/savingsLog';
import { periodStatus, shareByRule } from './engine/period';
import { currentPeriod } from './engine/paychecks';
import { DEFAULT_PAYDAY, periodMonth, planningView } from './engine/timing';
import { PaycheckButton } from './components/PaycheckButton';
import type { LogEntry } from './engine/types';
import { PotPanel } from './components/PotPanel';
import { TakeOut } from './components/TakeOut';
import { previewTakeOut } from './engine/takeOut';
import { MonthProgress } from './components/MonthProgress';
import { PaydaySettings } from './components/PaydaySettings';
import { useAccount } from './hooks/useAccount';
import { useEnvelopes } from './hooks/useEnvelopes';
import { useIsWide } from './hooks/useIsWide';
import { useSync } from './hooks/useSync';
import { sampleEnvelopes } from './sampleEnvelopes';
import { createLocalStore } from './storage/envelopeStore';
import { formatDayShort, formatMonthLong, formatMonthShort, ordinal } from './utils/format';
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
    correctPot,
    takeOut,
    logPaycheck,
    changeLogAmount,
    deleteLogEntry,
    settings,
    setPayday,
    data,
    replaceAll,
  } = useEnvelopes(store);
  const today = dayOfDate(new Date());
  const hasPayday = settings.payday !== DEFAULT_PAYDAY;
  // From your last recorded paycheck, or your usual payday until you record one.
  const period = currentPeriod(log, today, settings.payday);
  const currentPaycheck = period.month;
  const phase = { last: period.start, next: period.nextExpected };
  // From the last payday to the next one: the stretch you can still contribute to.
  const paycheckLabel = hasPayday ? `${formatDayShort(phase.last)} – ${formatDayShort(phase.next)}` : undefined;
  const periodName = hasPayday ? 'this savings phase' : formatMonthLong(currentPaycheck).split(' ')[0];
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
  // Examples have no log: their made-up saved amounts become a made-up pot.
  // Your own pot comes from your log.
  const activeLog = useMemo<LogEntry[]>(
    () =>
      showingExample
        ? [{ id: 'example', kind: 'adjustment', amountCents: sampleEnvelopes(calendarMonth).reduce((sum, sample) => sum + sample.savedCents, 0) }]
        : log,
    [showingExample, log, calendarMonth],
  );
  const pot = potCents(envelopes, activeLog);
  // The engine plans in paychecks; the screens show your real dates.
  const planningExpenses = useMemo(() => planningView(envelopes, settings.payday), [envelopes, settings.payday]);
  // Planned from the pot as it stood when this period started, so the period's
  // amount stays fixed: what you put in and take out during it cancels out.
  const status = useMemo(
    () => periodStatus(planningExpenses, activeLog, currentPaycheck, period.start),
    [planningExpenses, activeLog, currentPaycheck, period.start],
  );
  const plan = status.plan;
  // What the pot holds right now for each expense.
  // Shared the same way as this period's plan, so the bars and the ledger agree.
  const potShares = useMemo(
    () => shareByRule(status, pot, planningExpenses, currentPaycheck),
    [status, pot, planningExpenses, currentPaycheck],
  );
  const shownEnvelopes = useMemo(
    () => withShares(envelopes, potShares, currentPaycheck),
    [envelopes, potShares, currentPaycheck],
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
                envelopes={shownEnvelopes}
                isExample={showingExample}
                closestFirst={status.rule === 'closest'}
                paycheckLabel={paycheckLabel}
                today={dayOfDate(new Date())}
                stillOpenCents={showingExample ? undefined : status.openCents}
              >
                {!showingExample && hasPayday && (
                  <PaycheckButton
                    period={period}
                    log={log}
                    payday={settings.payday}
                    today={today}
                    onLog={logPaycheck}
                    onUndo={deleteLogEntry}
                  />
                )}
                {!showingExample && plan[0] !== undefined && (
                  <MonthProgress
                    monthPlan={plan[0]}
                    status={status}
                    log={log}
                    today={dayOfDate(new Date())}
                    periodName={periodName}
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
                  Each month here is one paycheck, paid around the {ordinal(settings.payday)}, named after the
                  month it mostly covers. Underneath: the dates it has to last.
                </p>
              )}
              {layout === 'columns' ? (
                <LedgerColumns plan={plan} envelopes={shownEnvelopes} payday={settings.payday} currentStart={period.startIsReal ? period.start : undefined} />
              ) : (
                <LedgerRows plan={plan} envelopes={shownEnvelopes} payday={settings.payday} currentStart={period.startIsReal ? period.start : undefined} />
              )}
            </section>
          )}

          {!showingExample && !listIsEmpty && (
            <PotPanel
              potCents={pot}
              potShares={potShares}
              log={log}
              onCorrect={(actualCents) => correctPot(actualCents, pot, dayOfDate(new Date()))}
              onUndo={deleteLogEntry}
              onChangeAmount={changeLogAmount}
              onDelete={deleteLogEntry}
            >
              <TakeOut
                previewFor={(amountCents) => previewTakeOut(planningExpenses, log, currentPaycheck, period.start, amountCents, today)}
                unit={hasPayday ? 'paycheck' : 'month'}
                periodLabel={(month) => formatMonthShort(periodMonth(month, settings.payday))}
                log={log}
                onTakeOut={(amountCents, reason) => takeOut({ date: today, month: currentPaycheck, amountCents, reason })}
                onUndo={deleteLogEntry}
              />
            </PotPanel>
          )}

          <ExpenseList
            envelopes={savedEnvelopes}
            sharesById={potShares.shares}
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
