import { useId, useState, type FormEvent } from 'react';
import { checkNewPassphrase } from '../sync/syncCore';

// The screens that appear while sync isn't running yet: choosing the
// passphrase (first device), unlocking (other devices), and picking a copy
// when both changed.

/**
 * Password managers file a password under a username. This invisible field
 * carries your email so the passphrase is saved — and offered again — for it.
 */
function UsernameForPasswordManagers({ email }: { email: string }) {
  return (
    <input
      type="email"
      name="username"
      autoComplete="username"
      value={email}
      readOnly
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
    />
  );
}

interface PassphraseSetupProps {
  email: string;
  onTurnOn: (passphrase: string) => Promise<string | null>;
}

/** First device: choose the passphrase that locks your expenses. */
export function PassphraseSetup({ email, onTurnOn }: PassphraseSetupProps) {
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [isStored, setIsStored] = useState(false);
  const [isShown, setIsShown] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const problem = checkNewPassphrase(first, second);
    if (problem !== null) {
      setError(problem);
      return;
    }
    if (!isStored) {
      setError('Tick the box once your passphrase is stored somewhere safe.');
      return;
    }
    setIsBusy(true);
    setError(await onTurnOn(first));
    setIsBusy(false);
  }

  return (
    <form className="sync-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
      <p className="sync-text">
        Choose a passphrase. Your expenses are locked with it before they leave this device, so Supabase only
        ever stores the locked version. Four or five random words make a strong, memorable passphrase.
      </p>
      <UsernameForPasswordManagers email={email} />
      <div className="field">
        <label htmlFor={`${id}-first`}>Passphrase</label>
        <input
          id={`${id}-first`}
          type={isShown ? 'text' : 'password'}
          autoComplete="new-password"
          value={first}
          onChange={(event) => {
            setFirst(event.target.value);
            setError(null);
          }}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-second`}>Type it again</label>
        <input
          id={`${id}-second`}
          type={isShown ? 'text' : 'password'}
          autoComplete="new-password"
          value={second}
          onChange={(event) => {
            setSecond(event.target.value);
            setError(null);
          }}
        />
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={isShown} onChange={(event) => setIsShown(event.target.checked)} />
        <span>Show passphrase</span>
      </label>
      <label className="checkbox checkbox--top">
        <input
          type="checkbox"
          checked={isStored}
          onChange={(event) => {
            setIsStored(event.target.checked);
            setError(null);
          }}
        />
        <span>
          I've stored this passphrase somewhere safe, like a password manager. If it's lost, nobody can
          recover my synced expenses.
        </span>
      </label>
      {error !== null && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="sync-actions">
        <button type="submit" className="button-primary" disabled={isBusy}>
          {isBusy ? 'Locking…' : 'Turn on sync'}
        </button>
      </div>
    </form>
  );
}

interface PassphraseUnlockProps {
  email: string;
  onUnlock: (passphrase: string) => Promise<string | null>;
}

/** Another device: unlock with the passphrase chosen on the first one. */
export function PassphraseUnlock({ email, onUnlock }: PassphraseUnlockProps) {
  const [passphrase, setPassphrase] = useState('');
  const [isShown, setIsShown] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (passphrase === '') {
      setError('Enter your passphrase');
      return;
    }
    setIsBusy(true);
    setError(await onUnlock(passphrase));
    setIsBusy(false);
  }

  return (
    <form className="sync-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
      <p className="sync-text">
        Sync is on for your account. Enter your passphrase to unlock your expenses on this device. You'll only
        need to do this once here.
      </p>
      <UsernameForPasswordManagers email={email} />
      <div className="field">
        <label htmlFor={`${id}-passphrase`}>Passphrase</label>
        <input
          id={`${id}-passphrase`}
          type={isShown ? 'text' : 'password'}
          autoComplete="current-password"
          value={passphrase}
          aria-invalid={error !== null}
          onChange={(event) => {
            setPassphrase(event.target.value);
            setError(null);
          }}
        />
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={isShown} onChange={(event) => setIsShown(event.target.checked)} />
        <span>Show passphrase</span>
      </label>
      {error !== null && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="sync-actions">
        <button type="submit" className="button-primary" disabled={isBusy}>
          {isBusy ? 'Unlocking…' : 'Unlock'}
        </button>
      </div>
    </form>
  );
}

function expensesLabel(count: number): string {
  return count === 1 ? '1 expense' : `${count} expenses`;
}

interface ChooseCopyProps {
  deviceCount: number;
  syncedCount: number;
  onChoose: (keep: 'synced' | 'this-device') => void;
}

/** Both this device and the synced copy changed: you decide which one both devices use. */
export function ChooseCopy({ deviceCount, syncedCount, onChoose }: ChooseCopyProps) {
  return (
    <div className="sync-form" role="group" aria-labelledby="choose-copy-text">
      <p id="choose-copy-text" className="sync-text">
        This device and your synced copy both changed since they last matched. Which one should both devices
        use? The other version will be replaced. If you're unsure, download a backup below first.
      </p>
      <dl className="copy-counts">
        <div>
          <dt>This device</dt>
          <dd>{expensesLabel(deviceCount)}</dd>
        </div>
        <div>
          <dt>Synced copy</dt>
          <dd>{expensesLabel(syncedCount)}</dd>
        </div>
      </dl>
      <div className="sync-actions">
        <button type="button" className="button-secondary" onClick={() => onChoose('synced')}>
          Use synced copy
        </button>
        <button type="button" className="button-secondary" onClick={() => onChoose('this-device')}>
          Use this device's
        </button>
      </div>
    </div>
  );
}
