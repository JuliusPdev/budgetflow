import { useEffect, useState } from 'react';
import type { Envelope, EnvelopeFields } from '../engine/types';
import type { EnvelopeStore } from '../storage/envelopeStore';

/**
 * Your list of envelopes: loaded from the store on start, saved back after
 * every change, with actions to add, change and remove envelopes.
 */
export function useEnvelopes(store: EnvelopeStore) {
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // True when the browser refuses to read or write storage (e.g. some private windows).
  const [storageProblem, setStorageProblem] = useState(false);

  useEffect(() => {
    // Ignore a late answer if the screen has gone away in the meantime.
    let cancelled = false;
    store.load().then(
      (loaded) => {
        if (cancelled) return;
        setEnvelopes(loaded);
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
  // starting list would overwrite what's stored.
  useEffect(() => {
    if (isLoading) return;
    store.save(envelopes).then(
      () => setStorageProblem(false),
      () => setStorageProblem(true),
    );
  }, [envelopes, isLoading, store]);

  function addEnvelope(fields: EnvelopeFields): void {
    // Created outside the update so a re-run update can't hand out a second id.
    const envelope: Envelope = { ...fields, id: crypto.randomUUID() };
    setEnvelopes((current) => [...current, envelope]);
  }

  function updateEnvelope(id: string, changes: Partial<EnvelopeFields>): void {
    setEnvelopes((current) =>
      current.map((envelope) => (envelope.id === id ? { ...envelope, ...changes } : envelope)),
    );
  }

  function removeEnvelope(id: string): void {
    setEnvelopes((current) => current.filter((envelope) => envelope.id !== id));
  }

  /** Puts a deleted envelope back where it was — the Undo after a delete. */
  function restoreEnvelope(envelope: Envelope, index: number): void {
    setEnvelopes((current) => [...current.slice(0, index), envelope, ...current.slice(index)]);
  }

  /** Swaps the whole list for another — used when restoring a backup. */
  function replaceAllEnvelopes(replacement: Envelope[]): void {
    setEnvelopes(replacement);
  }

  return {
    envelopes,
    replaceAllEnvelopes,
    isLoading,
    storageProblem,
    addEnvelope,
    updateEnvelope,
    removeEnvelope,
    restoreEnvelope,
  };
}
