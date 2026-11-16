import { useEffect, useState } from 'react';
import { applySplit } from '../engine/savingsLog';
import type { BudgetData, Envelope, EnvelopeFields, SetAsideEntry } from '../engine/types';
import type { EnvelopeStore } from '../storage/envelopeStore';

/**
 * Your budget — the envelopes and the savings log: loaded from the store on
 * start, saved back after every change, with actions to change it.
 */
export function useEnvelopes(store: EnvelopeStore) {
  const [data, setData] = useState<BudgetData>({ envelopes: [], log: [] });
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

  /** Changes only the envelopes, leaving the log as it is. */
  function changeEnvelopes(change: (current: Envelope[]) => Envelope[]): void {
    setData((current) => ({ ...current, envelopes: change(current.envelopes) }));
  }

  function addEnvelope(fields: EnvelopeFields): void {
    // Created outside the update so a re-run update can't hand out a second id.
    const envelope: Envelope = { ...fields, id: crypto.randomUUID() };
    changeEnvelopes((current) => [...current, envelope]);
  }

  function updateEnvelope(id: string, changes: Partial<EnvelopeFields>): void {
    changeEnvelopes((current) =>
      current.map((envelope) => (envelope.id === id ? { ...envelope, ...changes } : envelope)),
    );
  }

  function removeEnvelope(id: string): void {
    changeEnvelopes((current) => current.filter((envelope) => envelope.id !== id));
  }

  /** Puts a deleted envelope back where it was — the Undo after a delete. */
  function restoreEnvelope(envelope: Envelope, index: number): void {
    changeEnvelopes((current) => [...current.slice(0, index), envelope, ...current.slice(index)]);
  }

  /**
   * Records money you set aside and adds its split to the envelopes — in one
   * step, so the log and the envelopes can never disagree. Returns the entry's id.
   */
  function logSetAside(details: Omit<SetAsideEntry, 'id' | 'kind'>): string {
    // Created outside the update so a re-run update can't hand out a second id.
    const entry: SetAsideEntry = { ...details, id: crypto.randomUUID(), kind: 'set-aside' };
    setData((current) => ({
      envelopes: applySplit(current.envelopes, entry.split, 1),
      log: [...current.log, entry],
    }));
    return entry.id;
  }

  /** Removes a log entry and reverses exactly what it did to the envelopes. */
  function deleteLogEntry(id: string): void {
    setData((current) => {
      const entry = current.log.find((candidate) => candidate.id === id);
      if (entry === undefined) return current;
      const envelopes = entry.kind === 'set-aside' ? applySplit(current.envelopes, entry.split, -1) : current.envelopes;
      return { envelopes, log: current.log.filter((candidate) => candidate.id !== id) };
    });
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
    deleteLogEntry,
  };
}
