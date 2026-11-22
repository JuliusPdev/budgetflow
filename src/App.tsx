import { useMemo, useState } from 'react';
import { AddExpenseDialog } from './components/AddExpenseDialog';
import { Backup } from './components/Backup';
import { EmptyStart, ExampleBanner } from './components/ExampleNotice';
import { ExpenseList, NEW_EXPENSE } from './components/ExpenseList';
import { LedgerColumns, LedgerTimeline } from './components/Ledger';
import { SyncPanel } from './components/SyncPanel';
import { ThisMonth } from './components/ThisMonth';
import { dayOfDate, monthOfDate } from './engine/months';
import { buildColumns } from './engine/columns';
import { previewExpense, type ExpensePreview } from './engine/expensePreview';
import { buildFillUpView } from './engine/fillUp';
import { withShares } from './engine/pot';
import { previewPayment, type PaymentPreview } from './engine/paymentPreview';
import { addUpParts, coverPaidFirst, progressById, ticksToPayments, withPayments } from './engine/payments';
import { potCents } from './engine/savingsLog';
import { periodStatus, shareByRule } from './engine/period';
import { currentPeriod } from './engine/paychecks';
import { DEFAULT_PAYDAY, paycheckDates, periodMonth, planningView } from './engine/timing';
import { PaycheckButton } from './components/PaycheckButton';
import { PayDialog } from './components/PayDialog';
import type { ExpenseFields, LogEntry } from './engine/types';
import { PotPanel } from './components/PotPanel';
import { TakeOut } from './components/TakeOut';
import { previewTakeOut } from './engine/takeOut';
import { MonthProgress } from './components/MonthProgress';
import { PaydaySettings } from './components/PaydaySettings';
import { useAccount } from './hooks/useAccount';
import { useEnvelopes } from './hooks/useEnvelopes';
import { useSync } from './hooks/useSync';
import { sampleEnvelopes } from './sampleEnvelopes';
import { createLocalStore } from './storage/envelopeStore';
import { formatDayShort, formatEuros, formatMonthLong, formatMonthShort, ordinal } from './utils/format';
import { wholeEuros } from './utils/wholeEuros';
import { loadHideExamples, saveHideExamples } from './storage/preferences';

type Layout = 'timeline' | 'columns';

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
    pay,
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
  const periodName = hasPayday ? 'this paycheck' : formatMonthLong(currentPaycheck).split(' ')[0];
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
  // Examples have no log: their made-up saved amounts become a made-up pot,
  // and the one marked as paid gets a made-up payment.
  const example = useMemo(() => {
    const samples = sampleEnvelopes(calendarMonth);
    const { expenses, payments } = ticksToPayments(samples);
    const startingPot: LogEntry = {
      id: 'example',
      kind: 'adjustment',
      amountCents: samples.reduce((sum, sample) => sum + sample.savedCents, 0),
    };
    return { expenses, log: [startingPot, ...payments] };
  }, [calendarMonth]);
  const envelopes = showingExample ? example.expenses : savedEnvelopes;
  // Your own pot comes from your log.
  const activeLog = showingExample ? example.log : log;
  const pot = potCents(activeLog);
  // The engine plans in paychecks; the screens show your real dates. Expenses
  // with payments are split into paid parts and the part still to pay.
  const planningExpenses = useMemo(
    () => withPayments(planningView(envelopes, settings.payday), activeLog, settings.payday),
    [envelopes, activeLog, settings.payday],
  );
  // Planned from the pot as it stood when this period started, so the period's
  // amount stays fixed: what you put in and take out during it cancels out.
  const status = useMemo(
    () => periodStatus(planningExpenses, activeLog, currentPaycheck, period.start),
    [planningExpenses, activeLog, currentPaycheck, period.start],
  );
  const plan = status.plan;
  // What the pot holds right now for each expense.
  // Shared the same way as this period's plan, so the bars and the ledger agree.
  // Rounded to whole euros for reading; the engine keeps its exact cents.
  const potShares = useMemo(() => {
    const exact = shareByRule(status, pot, planningExpenses, currentPaycheck);
    return { ...exact, shares: wholeEuros(exact.shares) };
  }, [status, pot, planningExpenses, currentPaycheck]);
  // Each paycheck's split in whole euros too; its total already is. The parts
  // of an expense with payments are added up: one amount per expense.
  // (Bills stay per part: a paid part left on its own day.)
  const shownPlan = useMemo(
    () =>
      plan.map((monthPlan) => ({
        ...monthPlan,
        byEnvelope: wholeEuros(addUpParts(monthPlan.byEnvelope, planningExpenses)),
      })),
    [plan, planningExpenses],
  );
  // Split the same way, but by calendar month: the screens show real dates.
  const shownEnvelopes = useMemo(
    () => coverPaidFirst(withShares(withPayments(envelopes, activeLog, DEFAULT_PAYDAY), potShares, currentPaycheck)),
    [envelopes, activeLog, potShares, currentPaycheck],
  );
  // What the pot holds for each expense's part still to pay (its own id), after
  // its payments are covered. Settled expenses have none, like before.
  const shownShares = useMemo(
    () =>
      Object.fromEntries(
        shownEnvelopes.filter((part) => part.id in potShares.shares).map((part) => [part.id, part.savedCents]),
      ),
    [shownEnvelopes, potShares],
  );
  // Each expense's parts added back together: paid so far, and taken care of.
  const progress = useMemo(() => progressById(shownEnvelopes), [shownEnvelopes]);
  // How each expense fills up, on the same time axis as the Columns view.
  // Not for example data: the list shows only your own expenses.
  const fillUpView = useMemo(() => {
    if (showingExample) return null;
    const layout = buildColumns(shownPlan, shownEnvelopes, settings.payday, today, period.startIsReal ? period.start : undefined);
    return layout === null ? null : buildFillUpView(layout, shownEnvelopes);
  }, [showingExample, shownPlan, shownEnvelopes, settings.payday, today, period.startIsReal, period.start]);

  // The timeline reads well on every screen, so it's the default; columns are a choice.
  const [layout, setLayout] = useState<Layout>('timeline');

  // Which expense form is open. Kept here, not in the list, because the
  // "Add your first expense" buttons at the top need to open it too.
  const [openForm, setOpenForm] = useState<string | null>(null);

  function changeHideExamples(hide: boolean): void {
    setHideExamples(hide);
    saveHideExamples(hide);
  }

  function openAddForm(): void {
    // Opens the add-an-expense dialog in front of the page.
    setOpenForm(NEW_EXPENSE);
  }

  // What adding or changing an expense would do, before saving. Always against
  // your own expenses and log, never the examples: your first expense replaces them.
  const ownPlanning = useMemo(() => planningView(savedEnvelopes, settings.payday), [savedEnvelopes, settings.payday]);
  function previewFor(fields: ExpenseFields, replaceId?: string): ExpensePreview {
    const draft = planningView([{ ...fields, id: replaceId ?? 'new-expense' }], settings.payday);
    return previewExpense(
      withPayments(ownPlanning, log, settings.payday),
      log,
      currentPaycheck,
      period.start,
      withPayments(draft, log, settings.payday),
      replaceId,
    );
  }

  // Which expense the Pay window is open for, if any.
  const [payingFor, setPayingFor] = useState<string | null>(null);
  // The payment just made, so it can be undone right away.
  const [lastPayment, setLastPayment] = useState<{ id: string; name: string; amountCents: number } | null>(null);
  const payingExpense = savedEnvelopes.find((envelope) => envelope.id === payingFor);
  /** What paying `amountCents` on `date` towards an expense would change, before saving. */
  function previewPayFor(envelopeId: string, amountCents: number, date: string): PaymentPreview {
    const payment = { id: 'preview', kind: 'payment', date, envelopeId, amountCents } as const;
    return previewPayment(ownPlanning, log, settings.payday, currentPaycheck, period.start, payment);
  }
  /** A paycheck by its payday, "21 Dec"; plain months without a payday. */
  function nameOfPaycheck(month: string): string {
    return hasPayday ? formatDayShort(paycheckDates(month, settings.payday).last) : formatMonthShort(month);
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
                monthPlan={shownPlan[0]}
                envelopes={shownEnvelopes}
                progress={progress}
                isExample={showingExample}
                closestFirst={status.rule === 'closest'}
                paycheckLabel={paycheckLabel}
                today={dayOfDate(new Date())}
                stillOpenCents={showingExample ? undefined : status.openCents}
                onAddExpense={showingExample ? undefined : openAddForm}
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
                  {(['timeline', 'columns'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={layout === option}
                      onClick={() => setLayout(option)}
                    >
                      {option === 'timeline' ? 'Timeline' : 'Columns'}
                    </button>
                  ))}
                </div>
              </div>
              {hasPayday && layout === 'columns' && (
                <p className="field-hint ledger-note">
                  Each column is one paycheck, from payday (around the {ordinal(settings.payday)}) to the next.
                  Money is put aside at its left edge; thin lines show where a month begins.
                </p>
              )}
              {layout === 'columns' ? (
                <LedgerColumns plan={shownPlan} envelopes={shownEnvelopes} payday={settings.payday} currentStart={period.startIsReal ? period.start : undefined} today={today} />
              ) : (
                <LedgerTimeline plan={shownPlan} envelopes={shownEnvelopes} payday={settings.payday} currentStart={period.startIsReal ? period.start : undefined} today={today} />
              )}
            </section>
          )}

          {!showingExample && !listIsEmpty && (
            <PotPanel
              potCents={pot}
              potShares={potShares}
              closestFirst={status.rule === 'closest'}
              log={log}
              onCorrect={(actualCents) => correctPot(actualCents, pot, dayOfDate(new Date()))}
              onUndo={deleteLogEntry}
              onChangeAmount={changeLogAmount}
              onDelete={deleteLogEntry}
              nameOf={(id) => savedEnvelopes.find((envelope) => envelope.id === id)?.name}
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
            sharesById={shownShares}
            progress={progress}
            onPay={(id) => {
              setPayingFor(id);
              setLastPayment(null);
            }}
            lastPayment={
              lastPayment === null || !log.some((entry) => entry.id === lastPayment.id)
                ? null
                : {
                    text: `Paid ${formatEuros(lastPayment.amountCents)} towards ${lastPayment.name}.`,
                    onUndo: () => {
                      deleteLogEntry(lastPayment.id);
                      setLastPayment(null);
                    },
                  }
            }
            payday={settings.payday}
            onUpdate={updateEnvelope}
            onRemove={removeEnvelope}
            onRestore={restoreEnvelope}
            openForm={openForm}
            onOpenFormChange={setOpenForm}
            previewFor={previewFor}
            paycheckLabel={nameOfPaycheck}
            fillUp={fillUpView === null ? undefined : { view: fillUpView, currentDone: status.openCents === 0 }}
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
          {openForm === NEW_EXPENSE && (
            <AddExpenseDialog
              payday={settings.payday}
              previewFor={(fields) => previewFor(fields)}
              paycheckLabel={nameOfPaycheck}
              onAdd={addEnvelope}
              onClose={() => setOpenForm(null)}
            />
          )}
          {payingExpense !== undefined && (
            <PayDialog
              expense={payingExpense}
              paidCents={progress[payingExpense.id]?.paidCents ?? 0}
              today={today}
              previewFor={(amountCents, date) => previewPayFor(payingExpense.id, amountCents, date)}
              paycheckLabel={nameOfPaycheck}
              unit={hasPayday ? 'paycheck' : 'month'}
              onPay={(amountCents, date, note) => {
                const entryId = pay({ envelopeId: payingExpense.id, amountCents, date, note });
                setLastPayment({ id: entryId, name: payingExpense.name, amountCents });
              }}
              onClose={() => setPayingFor(null)}
            />
          )}
        </main>
      )}
    </div>
  );
}
