import { useEffect, useId, useState, type FormEvent } from 'react';
import type { AccountState } from '../hooks/useAccount';
import type { SyncStatus } from '../hooks/useSync';
import { isPlausibleEmail, normalizeEmail, RESEND_WAIT_MS, secondsUntil } from '../sync/signInInput';
import { ChooseCopy, PassphraseSetup, PassphraseUnlock } from './SyncSetup';

interface SyncPanelProps {
  account: AccountState;
  /** A problem with the sign-in link you just came back from. */
  linkError: string | null;
  onSendLink: (email: string) => Promise<string | null>;
  onSignOut: () => Promise<void>;
  sync: {
    status: SyncStatus;
    turnOn: (passphrase: string) => Promise<string | null>;
    unlock: (passphrase: string) => Promise<string | null>;
    choose: (keep: 'synced' | 'this-device') => Promise<void>;
    retry: () => void;
    unavailableMessage: string;
    problemMessage: string;
  };
}

const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

type Step = 'email' | 'sent';

/** Sign in with a link sent by email, so your devices can share one list. */
export function SyncPanel({ account, linkError, onSendLink, onSignOut, sync }: SyncPanelProps) {
  const [step, setStep] = useState<Step>('email');
  const [emailText, setEmailText] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentAgain, setSentAgain] = useState(false);
  // When sending is allowed again, and "now", ticking once a second while waiting.
  const [resendAllowedAt, setResendAllowedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const fieldId = useId();
  const errorId = `${fieldId}-error`;

  useEffect(() => {
    if (resendAllowedAt === null) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      // Waiting is over: stop ticking.
      if (current >= resendAllowedAt) setResendAllowedAt(null);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendAllowedAt]);

  // Worked out, not stored: seconds left before another email may be sent.
  const waitSeconds = resendAllowedAt === null ? 0 : secondsUntil(resendAllowedAt, now);

  async function send(): Promise<void> {
    if (waitSeconds > 0) return;
    setIsBusy(true);
    const problem = await onSendLink(normalizeEmail(emailText));
    setIsBusy(false);
    setError(problem);
    if (problem !== null) return;
    const sentAt = Date.now();
    setNow(sentAt);
    setResendAllowedAt(sentAt + RESEND_WAIT_MS);
    setSentAgain(step === 'sent');
    setStep('sent');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!isPlausibleEmail(emailText)) {
      setError('Enter your email address, like name@example.com');
      return;
    }
    void send();
  }

  function startOver(): void {
    setStep('email');
    setError(null);
    setSentAgain(false);
  }

  const shownError = error ?? linkError;

  return (
    <section className="sync" aria-labelledby="sync-title">
      <h2 id="sync-title" className="section-label">
        Sync between devices
      </h2>

      {account.status === 'checking' && <p className="sync-text">Checking sign-in…</p>}

      {account.status === 'signed-in' && (
        <>
          {sync.status.kind === 'starting' && <p className="sync-text">Connecting to sync…</p>}
          {sync.status.kind === 'needs-setup' && <PassphraseSetup email={account.email} onTurnOn={sync.turnOn} />}
          {sync.status.kind === 'needs-unlock' && <PassphraseUnlock email={account.email} onUnlock={sync.unlock} />}
          {sync.status.kind === 'choose' && (
            <ChooseCopy
              deviceCount={sync.status.deviceCount}
              syncedCount={sync.status.syncedCount}
              onChoose={(keep) => void sync.choose(keep)}
            />
          )}

          <p className="sync-status" aria-live="polite">
            {sync.status.kind === 'saving' && <span className="sync-dot sync-dot--busy">Saving…</span>}
            {sync.status.kind === 'synced' && (
              <span className="sync-dot">Synced at {timeFormat.format(sync.status.at)}</span>
            )}
          </p>

          {(sync.status.kind === 'unavailable' || sync.status.kind === 'problem') && (
            <div className="sync-warning" role="alert">
              <p>
                {sync.status.kind === 'unavailable' ? sync.unavailableMessage : sync.problemMessage} Your
                changes are kept on this device.
              </p>
              <button type="button" className="button-secondary" onClick={sync.retry}>
                Try again
              </button>
            </div>
          )}

          <p className="sync-text">
            Signed in as <strong>{account.email}</strong>. Signing out removes the unlocking key from this
            device; your expenses stay here.
          </p>
          <div className="sync-actions">
            <button type="button" className="button-secondary" onClick={() => void onSignOut()}>
              Sign out
            </button>
          </div>
        </>
      )}

      {account.status === 'signed-out' && step === 'email' && (
        <form className="sync-form" onSubmit={handleSubmit} noValidate>
          <p className="sync-text">
            Sign in to keep your phone and laptop in step. You'll get a sign-in link by email, so there's no
            password.
          </p>
          <div className="field">
            <label htmlFor={`${fieldId}-email`}>Email</label>
            <input
              id={`${fieldId}-email`}
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="name@example.com"
              value={emailText}
              aria-invalid={error !== null}
              aria-describedby={shownError !== null ? errorId : undefined}
              onChange={(event) => {
                setEmailText(event.target.value);
                setError(null);
              }}
            />
            {shownError !== null && (
              <p id={errorId} className="field-error" role="alert">
                {shownError}
              </p>
            )}
          </div>
          <div className="sync-actions">
            <button type="submit" className="button-primary" disabled={isBusy || waitSeconds > 0}>
              {isBusy ? 'Sending…' : waitSeconds > 0 ? `Send link in ${waitSeconds} s` : 'Send link'}
            </button>
          </div>
          {waitSeconds > 0 && <p className="field-hint">Waiting a minute saves your hourly email allowance.</p>}
        </form>
      )}

      {account.status === 'signed-out' && step === 'sent' && (
        <div className="sync-form">
          <p className="sync-text" aria-live="polite">
            {sentAgain ? 'Sent again. ' : ''}Check <strong>{normalizeEmail(emailText)}</strong> for a sign-in
            link and open it <strong>in this browser</strong>. It can take a minute to arrive, so check spam too.
          </p>
          {error !== null && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div className="sync-actions">
            <button
              type="button"
              className="button-secondary"
              disabled={isBusy || waitSeconds > 0}
              onClick={() => void send()}
            >
              {isBusy ? 'Sending…' : waitSeconds > 0 ? `Send again in ${waitSeconds} s` : 'Send again'}
            </button>
            <button type="button" className="button-secondary" onClick={startOver}>
              Use a different email
            </button>
          </div>
          {waitSeconds > 0 && (
            <p className="field-hint">
              Supabase sends only about 2 sign-in emails per hour, so sending again waits a minute.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
