import { useRef, useState, type ChangeEvent } from 'react';
import type { Envelope } from '../engine/types';
import { parseBackup, serializeBackup } from '../storage/envelopeStore';

interface BackupProps {
  /** Your saved expenses (never the examples). */
  envelopes: Envelope[];
  onRestore: (envelopes: Envelope[]) => void;
  /** True once sync is running, which changes what a backup is for. */
  isSyncing: boolean;
}

function expensesLabel(count: number): string {
  return count === 1 ? '1 expense' : `${count} expenses`;
}

/** Today as "2026-11-16", for the backup's file name. */
function todayStamp(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Download your expenses as a file, or restore them from one. All on your device. */
export function Backup({ envelopes, onRestore, isSyncing }: BackupProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  // A valid backup waiting for "Replace?" because you already have expenses.
  const [pending, setPending] = useState<Envelope[] | null>(null);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  function handleDownload(): void {
    const file = new Blob([serializeBackup(envelopes)], { type: 'application/json' });
    const address = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = address;
    link.download = `budgetflow-backup-${todayStamp()}.json`;
    link.click();
    // Give the browser a moment to start the download before freeing the memory.
    window.setTimeout(() => URL.revokeObjectURL(address), 1000);
    setMessage({ text: `Backup of ${expensesLabel(envelopes.length)} downloaded`, isError: false });
  }

  function restore(fromBackup: Envelope[]): void {
    onRestore(fromBackup);
    setPending(null);
    setMessage({ text: `Restored ${expensesLabel(fromBackup.length)}`, isError: false });
  }

  async function handleFileChosen(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    // Clear the picker so choosing the same file again still triggers this.
    event.target.value = '';
    if (file === undefined) return;

    const fromBackup = parseBackup(await file.text());
    if (fromBackup === null) {
      setPending(null);
      setMessage({ text: "That file isn't a BudgetFlow backup. Nothing was changed.", isError: true });
      return;
    }
    setMessage(null);
    // Replacing an existing list is the one step that can't be undone, so ask first.
    if (envelopes.length > 0) setPending(fromBackup);
    else restore(fromBackup);
  }

  return (
    <section className="backup" aria-labelledby="backup-title">
      <h2 id="backup-title" className="section-label">
        Backup
      </h2>
      <p className="backup-text">
        {isSyncing
          ? 'Your expenses are synced between your devices. A backup is an extra safety copy, worth having in case you ever forget your passphrase.'
          : 'Your expenses live only in this browser. Download a backup now and then, and keep it somewhere safe.'}
      </p>

      <div className="backup-actions">
        {envelopes.length > 0 && (
          <button type="button" className="button-secondary" onClick={handleDownload}>
            Download backup
          </button>
        )}
        <button type="button" className="button-secondary" onClick={() => fileInput.current?.click()}>
          Restore from backup
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={handleFileChosen}
        />
      </div>

      {pending !== null && (
        <div className="backup-confirm" role="alertdialog" aria-labelledby="backup-confirm-text">
          <p id="backup-confirm-text">
            Replace your {expensesLabel(envelopes.length)} with the {expensesLabel(pending.length)} in this
            backup?
          </p>
          <div className="backup-actions">
            <button type="button" className="button-primary" onClick={() => restore(pending)}>
              Replace
            </button>
            <button type="button" className="button-secondary" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <p className={message?.isError ? 'backup-message backup-message--error' : 'backup-message'} aria-live="polite">
        {message?.text}
      </p>
    </section>
  );
}
