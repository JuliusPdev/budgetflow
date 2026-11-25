import { useMemo, useState } from 'react';
import { AddExpenseDialog } from './components/AddExpenseDialog';
import { Backup } from './components/Backup';
import { EmptyStart, ExampleBanner } from './components/ExampleNotice';
import { ExpenseList, NEW_EXPENSE } from './components/ExpenseList';
import { LedgerColumns, LedgerTimeline } from './components/Ledger';
import { SyncPanel } from './components/SyncPanel';
import { ThisMonth } from './components/ThisMonth';
import { dayBefore, dayOfDate, monthOfDate } from './engine/months';
import { buildColumns } from './engine/columns';
import { previewExpense, type ExpensePreview } from './engine/expensePreview';
import { buildFillUpView } from './engine/fillUp';
import { doneMarks } from './engine/timeline';
import { buildHistory } from './engine/history';
import { overdueExpenses } from './engine/overdue';
import { withShares } from './engine/pot';
import { previewDone, previewPayment, type PaymentPreview } from './engine/paymentPreview';
import { addUpParts, coverPaidFirst, finishSplit, fromSpendingById, paidCentsById, progressById, ticksToPayments, withPayments, type ExtraFrom } from './engine/payments';
import { potCents } from './engine/savingsLog';
import { periodStatus, shareByRule } from './engine/period';
import { currentPeriod } from './engine/paychecks';
import { DEFAULT_PAYDAY, paycheckDates, periodMonth, planningView } from './engine/timing';
import { PaycheckStrip } from './components/PaycheckStrip';
import { DoneDialog } from './components/DoneDialog';
import { OverdueNotes } from './components/OverdueNotes';
import { PayDialog, type PayDetails } from './components/PayDialog';
import type { ClosedPaycheck, Expense, ExpenseFields, LogEntry } from './engine/types';
import { PotBox } from './components/PotBox';
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
    takeOut,
    pay,
    finish,
    reopen,
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
  // Its last day is the day before the next payday; while that paycheck is late, it runs until today.
  const paycheckLabel = hasPayday
    ? `${formatDayShort(phase.last)} – ${period.daysLate === null ? formatDayShort(dayBefore(phase.next)) : 'today'}`
    : undefined;
  // When the next paycheck was expected, while you're waiting for it.
  const lateSince = period.daysLate === null ? undefined : period.nextExpected;
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
  // Finished expenses, for the ✓ in the timeline and Columns: your own only.
  const finished = useMemo(() => (showingExample ? [] : doneMarks(savedEnvelopes)), [showingExample, savedEnvelopes]);
  // The paychecks before this one, as they really happened: your own only.
  const past = useMemo(
    () => (showingExample ? [] : buildHistory(log, savedEnvelopes, settings.payday, currentPaycheck, period.start)),
    [showingExample, log, savedEnvelopes, settings.payday, currentPaycheck, period.start],
  );
  // Each expense's parts added back together: paid so far, and taken care of.
  // "Paid" counts money from spending too, and that part needs no saving: it's taken care of.
  const progress = useMemo(() => {
    const fromParts = progressById(shownEnvelopes);
    const paid = paidCentsById(activeLog);
    const spent = fromSpendingById(activeLog);
    const ids = new Set([...Object.keys(fromParts), ...Object.keys(paid)]);
    return Object.fromEntries(
      [...ids].map((expenseId) => [
        expenseId,
        {
          paidCents: paid[expenseId] ?? 0,
          coveredCents: (fromParts[expenseId]?.coveredCents ?? 0) + (spent[expenseId] ?? 0),
          fromSpendingCents: spent[expenseId] ?? 0,
        },
      ]),
    );
  }, [shownEnvelopes, activeLog]);
  // How each expense fills up, on the same time axis as the Columns view.
  // Not for example data: the list shows only your own expenses.
  const fillUpView = useMemo(() => {
    if (showingExample) return null;
    const layout = buildColumns(shownPlan, shownEnvelopes, settings.payday, today, period.startIsReal ? period.start : undefined, finished);
    return layout === null ? null : buildFillUpView(layout, shownEnvelopes);
  }, [showingExample, shownPlan, shownEnvelopes, settings.payday, today, period.startIsReal, period.start, finished]);

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
  // Which expense the Done window is open for, if any.
  const [finishingFor, setFinishingFor] = useState<string | null>(null);
  // The payment or Done just made, so it can be undone right away.
  const [lastAction, setLastAction] = useState<
    | { kind: 'payment'; id: string; expenseId: string; name: string; amountCents: number; targetBeforeCents?: number }
    | { kind: 'done'; expenseId: string; name: string }
    | null
  >(null);
  const payingExpense = savedEnvelopes.find((envelope) => envelope.id === payingFor);
  const finishingExpense = savedEnvelopes.find((envelope) => envelope.id === finishingFor);
  /** What a payment towards an expense would change, before saving. */
  function previewPayFor(envelopeId: string, { split, date, targetAfterCents }: PayDetails): PaymentPreview {
    const payment = {
      id: 'preview',
      kind: 'payment',
      date,
      envelopeId,
      amountCents: split.fromPotCents,
      fromSpendingCents: split.fromSpendingCents,
    } as const;
    return previewPayment(ownPlanning, log, settings.payday, currentPaycheck, period.start, payment, targetAfterCents);
  }
  /** What finishing an expense with this total would change, before saving. */
  function previewDoneFor(expense: Expense, costCents: number, date: string, extraFrom: ExtraFrom): PaymentPreview {
    const paidCents = progress[expense.id]?.paidCents ?? 0;
    const { fromPotCents, fromSpendingCents } = finishSplit(expense.targetCents, paidCents, costCents, extraFrom, pot);
    const payment =
      fromPotCents + fromSpendingCents > 0
        ? ({ id: 'preview', kind: 'payment', date, envelopeId: expense.id, amountCents: fromPotCents, fromSpendingCents } as const)
        : null;
    const done = { date, costCents, paymentId: payment?.id };
    return previewDone(ownPlanning, log, settings.payday, currentPaycheck, period.start, expense.id, done, payment);
  }
  /** The Undo bar under "Your expenses", while what it undoes is still there. */
  function undoBar(): { text: string; onUndo: () => void } | null {
    if (lastAction === null) return null;
    if (lastAction.kind === 'payment') {
      if (!log.some((entry) => entry.id === lastAction.id)) return null;
      return {
        text: `Paid ${formatEuros(lastAction.amountCents)} towards ${lastAction.name}.`,
        onUndo: () => {
          deleteLogEntry(lastAction.id);
          // A payment that raised the plan lowers it back again.
          if (lastAction.targetBeforeCents !== undefined) updateEnvelope(lastAction.expenseId, { targetCents: lastAction.targetBeforeCents });
          setLastAction(null);
        },
      };
    }
    if (savedEnvelopes.find((envelope) => envelope.id === lastAction.expenseId)?.done === undefined) return null;
    return {
      text: `Marked ${lastAction.name} as done.`,
      onUndo: () => {
        reopen(lastAction.expenseId);
        setLastAction(null);
      },
    };
  }
  /**
   * A payment changed in the pot's history may not pay more than the expense
   * needs: what's planned while it's open, what it really cost once done.
   */
  function problemWithAmount(entry: LogEntry, amountCents: number): string | null {
    if (entry.kind !== 'payment') return null;
    const expense = savedEnvelopes.find((envelope) => envelope.id === entry.envelopeId);
    if (expense === undefined) return null;
    const paidByOthers = (progress[expense.id]?.paidCents ?? 0) - entry.amountCents;
    if (expense.done !== undefined) {
      const mostCents = Math.max(0, expense.done.costCents - paidByOthers);
      return amountCents > mostCents
        ? `That's more than it cost (${formatEuros(expense.done.costCents)} in total). Reopen ${expense.name} first to change what it cost.`
        : null;
    }
    const mostCents = Math.max(0, expense.targetCents - paidByOthers);
    return amountCents > mostCents
      ? `That's more than the ${formatEuros(mostCents)} it can take. If ${expense.name} cost more, use Done.`
      : null;
  }
  /** A paycheck by its payday, "21 Dec"; plain months without a payday. */
  /**
   * The paycheck that's ending, as it's split right now: saved with the next
   * paycheck so its history keeps showing what it was for.
   */
  function closingSplit(): { closes?: ClosedPaycheck } {
    const current = shownPlan[0];
    if (current === undefined || current.month !== currentPaycheck) return {};
    const lines = Object.entries(current.byEnvelope).map(([id, cents]) => ({
      id,
      name: savedEnvelopes.find((expense) => expense.id === id)?.name ?? id,
      cents,
    }));
    return { closes: { paycheck: current.month, totalCents: current.totalCents, lines } };
  }

  function nameOfPaycheck(month: string): string {
    return hasPayday ? formatDayShort(paycheckDates(month, settings.payday).last) : formatMonthShort(month);
  }

  /**
   * Your expenses, once: in Columns they become the lanes inside What's coming
   * (each paycheck on top, Pay/Done/Edit on every lane); otherwise the list below.
   */
  function expenseList(inLanes: boolean) {
    return (
      <ExpenseList
        envelopes={savedEnvelopes}
        sharesById={shownShares}
        progress={progress}
        onPay={(id) => {
          setPayingFor(id);
          setLastAction(null);
        }}
        onDone={(id) => {
          setFinishingFor(id);
          setLastAction(null);
        }}
        onReopen={(id) => {
          reopen(id);
          setLastAction(null);
        }}
        lastAction={undoBar()}
        payday={settings.payday}
        onUpdate={updateEnvelope}
        onRemove={removeEnvelope}
        onRestore={restoreEnvelope}
        openForm={openForm}
        onOpenFormChange={setOpenForm}
        previewFor={previewFor}
        paycheckLabel={nameOfPaycheck}
        fillUp={fillUpView === null ? undefined : { view: fillUpView, currentDone: status.openCents === 0 }}
        lanes={inLanes ? { setAsideSoFarCents: Math.max(0, status.movements.netCents), openCents: status.openCents } : undefined}
        embedded={inLanes}
      />
    );
  }

  // The lanes need your own expenses on the plan's ruler; examples keep the plain Columns.
  const showLanes = layout === 'columns' && !showingExample && fillUpView !== null && savedEnvelopes.length > 0;

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
          <div className="dash-side">
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
                  strip={
                    !showingExample && hasPayday && paycheckLabel !== undefined ? (
                      <PaycheckStrip
                        period={period}
                        log={log}
                        payday={settings.payday}
                        today={today}
                        paycheckLabel={paycheckLabel}
                        onLog={(details) => logPaycheck({ ...details, ...closingSplit() })}
                        onUndo={deleteLogEntry}
                      />
                    ) : undefined
                  }
                >
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
                  {!showingExample && (
                    <OverdueNotes
                      overdue={overdueExpenses(savedEnvelopes, today)}
                      today={today}
                      onDone={(id) => {
                        setFinishingFor(id);
                        setLastAction(null);
                      }}
                      onMove={(id, due) => updateEnvelope(id, due.dueDate === undefined ? { dueMonth: due.dueMonth } : due)}
                    />
                  )}
                </ThisMonth>
              )}
            </div>
            {!showingExample && !listIsEmpty && (
              <PotBox potCents={pot} potShares={potShares}>
                <PotPanel
                  inBox
                  potCents={pot}
                  potShares={potShares}
                  closestFirst={status.rule === 'closest'}
                  log={log}
                  onChangeAmount={changeLogAmount}
                  onDelete={deleteLogEntry}
                  nameOf={(id) => savedEnvelopes.find((envelope) => envelope.id === id)?.name}
                  problemWith={problemWithAmount}
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
              </PotBox>
            )}
          </div>

          <div className="dash-main">
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
                {showLanes ? (
                  expenseList(true)
                ) : layout === 'columns' ? (
                  <LedgerColumns plan={shownPlan} envelopes={shownEnvelopes} payday={settings.payday} currentStart={period.startIsReal ? period.start : undefined} today={today} done={finished} past={past} lateSince={lateSince} setAsideSoFarCents={showingExample ? undefined : Math.max(0, status.movements.netCents)} />
                ) : (
                  <LedgerTimeline
                    plan={shownPlan}
                    envelopes={shownEnvelopes}
                    payday={settings.payday}
                    currentStart={period.startIsReal ? period.start : undefined}
                    today={today}
                    done={finished}
                    past={past}
                    setAsideSoFarCents={showingExample ? undefined : Math.max(0, status.movements.netCents)}
                    lateSince={lateSince}
                  />
                )}
              </section>
            )}


            {!showLanes && expenseList(false)}
          </div>

          <div className="dash-rest">
            <SyncPanel
              account={account}
              linkError={linkError}
              onSendLink={sendLink}
              onSignOut={signOutOfThisDevice}
              sync={sync}
            />

            <PaydaySettings payday={settings.payday} onChange={setPayday} />

            <Backup data={data} onRestore={replaceAll} isSyncing={isSyncing} />
          </div>
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
              potCents={pot}
              today={today}
              previewFor={(details) => previewPayFor(payingExpense.id, details)}
              paycheckLabel={nameOfPaycheck}
              unit={hasPayday ? 'paycheck' : 'month'}
              onPay={({ split, date, targetAfterCents }, note) => {
                const entryId = pay(
                  {
                    envelopeId: payingExpense.id,
                    amountCents: split.fromPotCents,
                    ...(split.fromSpendingCents > 0 ? { fromSpendingCents: split.fromSpendingCents } : {}),
                    date,
                    note,
                  },
                  targetAfterCents,
                );
                setLastAction({
                  kind: 'payment',
                  id: entryId,
                  expenseId: payingExpense.id,
                  name: payingExpense.name,
                  amountCents: split.fromPotCents + split.fromSpendingCents,
                  ...(targetAfterCents === undefined ? {} : { targetBeforeCents: payingExpense.targetCents }),
                });
              }}
              onClose={() => setPayingFor(null)}
            />
          )}
          {finishingExpense !== undefined && (
            <DoneDialog
              expense={finishingExpense}
              paidCents={progress[finishingExpense.id]?.paidCents ?? 0}
              potCents={pot}
              today={today}
              previewFor={(costCents, date, extraFrom) => previewDoneFor(finishingExpense, costCents, date, extraFrom)}
              paycheckLabel={nameOfPaycheck}
              unit={hasPayday ? 'paycheck' : 'month'}
              onDone={(costCents, date, extraFrom) => {
                const paidCents = progress[finishingExpense.id]?.paidCents ?? 0;
                finish(finishingExpense.id, date, costCents, finishSplit(finishingExpense.targetCents, paidCents, costCents, extraFrom, pot));
                setLastAction({ kind: 'done', expenseId: finishingExpense.id, name: finishingExpense.name });
              }}
              onClose={() => setFinishingFor(null)}
            />
          )}
        </main>
      )}
    </div>
  );
}
