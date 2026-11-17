import { useEffect, useState } from 'react';
import { DEFAULT_PAYDAY } from '../engine/timing';
import type { AdjustmentEntry, BudgetData, Cents, Day, Expense, ExpenseFields, PaycheckEntry, SetAsideEntry } from '../engine/types';
import type { EnvelopeStore } from '../storage/envelopeStore';

/**
 * Your budget — the envelopes and the savings log: loaded from the store on
 * start, saved back after every change, with actions to change it.
 */
export function useEnvelopes(store: EnvelopeStore) {
  const [data, setData] = useState<BudgetData>({ envelopes: [], log: [], settings: { payday: DEFAULT_PAYDAY } });
  const [isLoading, setIsLoading] = useState(true);
  // True when the browser refuses to read or write storage (e.g. some private windows).
  const [storageProblem, setStorageProblem] = useState(false);

  useEffect(() => {
    // Ignore a late answer if the screen has gone away in the meantime.
    let cancelled = false;
    store.load().then(
      (loaded) => {
        if (cancelled) return;
        setData(loaded);
        setIsLoading(false);
      },
      () => {
        if (cancelled) return;
        setStorageProblem(true);
        setIsLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [store]);

  // Save after every change — but never before loading finished, or the empty
  // starting budget would overwrite what's stored.
  useEffect(() => {
    if (isLoading) return;
    store.save(data).then(
      () => setStorageProblem(false),
      () => setStorageProblem(true),
    );
  }, [data, isLoading, store]);

  /** Changes only the expenses, leaving the log as it is. */
  function changeEnvelopes(change: (current: Expense[]) => Expense[]): void {
    setData((current) => ({ ...current, envelopes: change(current.envelopes) }));
  }

  function addEnvelope(fields: ExpenseFields): void {
    // Created outside the update so a re-run update can't hand out a second id.
    const envelope: Expense = { ...fields, id: crypto.randomUUID() };
    changeEnvelopes((current) => [...current, envelope]);
  }

  function updateEnvelope(id: string, changes: Partial<ExpenseFields>): void {
    changeEnvelopes((current) =>
      current.map((envelope) => (envelope.id === id ? { ...envelope, ...changes } : envelope)),
    );
  }

  function removeEnvelope(id: string): void {
    changeEnvelopes((current) => current.filter((envelope) => envelope.id !== id));
  }

  /** Puts a deleted envelope back where it was — the Undo after a delete. */
  function restoreEnvelope(envelope: Expense, index: number): void {
    changeEnvelopes((current) => [...current.slice(0, index), envelope, ...current.slice(index)]);
  }

  /** Records money you moved into savings. Returns the entry's id, for Undo. */
  function logSetAside(details: Omit<SetAsideEntry, 'id' | 'kind'>): string {
    // Created outside the update so a re-run update can't hand out a second id.
    const entry: SetAsideEntry = { ...details, id: crypto.randomUUID(), kind: 'set-aside' };
    setData((current) => ({ ...current, log: [...current.log, entry] }));
    return entry.id;
  }

  /** Records that your pay arrived, which starts a new savings period. Returns the entry's id, for Undo. */
  function logPaycheck(details: Omit<PaycheckEntry, 'id' | 'kind'>): string {
    const entry: PaycheckEntry = { ...details, id: crypto.randomUUID(), kind: 'paycheck' };
    setData((current) => ({ ...current, log: [...current.log, entry] }));
    return entry.id;
  }

  /**
   * Makes the pot match your real savings: records the difference between
   * what BudgetFlow thinks is there and what you say is there. Returns the
   * entry's id for Undo, or null when nothing needed changing.
   */
  function correctPot(actualCents: Cents, currentPotCents: Cents, today: Day): string | null {
    const differenceCents = actualCents - currentPotCents;
    if (differenceCents === 0) return null;
    const entry: AdjustmentEntry = {
      id: crypto.randomUUID(),
      kind: 'adjustment',
      amountCents: differenceCents,
      date: today,
      note: 'Correction',
    };
    setData((current) => ({ ...current, log: [...current.log, entry] }));
    return entry.id;
  }

  /**
   * Fixes the amount of a log entry, e.g. a set-aside typed wrong. The pot is
   * recalculated from the log, so nothing else needs adjusting.
   */
  function changeLogAmount(id: string, amountCents: Cents): void {
    setData((current) => ({
      ...current,
      log: current.log.map((entry) => (entry.id === id && entry.kind !== 'paycheck' ? { ...entry, amountCents } : entry)),
    }));
  }

  /** Removes a log entry. Nothing else to undo: the pot is always recalculated from the log. */
  function deleteLogEntry(id: string): void {
    setData((current) => ({ ...current, log: current.log.filter((entry) => entry.id !== id) }));
  }

  /** The day of the month your pay usually arrives. */
  function setPayday(payday: number): void {
    setData((current) => ({ ...current, settings: { ...current.settings, payday } }));
  }

  /** Swaps the whole budget for another — used by backups and sync. */
  function replaceAll(replacement: BudgetData): void {
    setData(replacement);
  }

  return {
    data,
    envelopes: data.envelopes,
    log: data.log,
    replaceAll,
    isLoading,
    storageProblem,
    addEnvelope,
    updateEnvelope,
    removeEnvelope,
    restoreEnvelope,
    logSetAside,
    correctPot,
    logPaycheck,
    changeLogAmount,
    deleteLogEntry,
    settings: data.settings,
    setPayday,
  };
}
