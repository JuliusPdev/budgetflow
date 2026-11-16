import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { friendlySignInError, readLinkReturn } from '../sync/signInInput';
import { appAddress, supabase } from '../sync/supabaseClient';

export type AccountState =
  | { status: 'checking' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; email: string; userId: string };

function accountFrom(session: Session | null): AccountState {
  if (session === null) return { status: 'signed-out' };
  return { status: 'signed-in', email: session.user.email ?? '', userId: session.user.id };
}

/**
 * Whether this device is signed in to sync, kept up to date as you sign in,
 * sign out, or the sign-in pass renews itself. Also finishes a sign-in when
 * you arrive from the emailed link.
 */
export function useAccount() {
  const [account, setAccount] = useState<AccountState>({ status: 'checking' });
  // A problem with the link you just came back from, in plain words.
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const linkReturn = readLinkReturn(window.location.search, window.location.hash);

    async function finishSignIn(): Promise<void> {
      // Supabase completes a sign-in from the link while initializing; only
      // afterwards is it safe to tidy the details out of the address bar.
      const { error } = await supabase.auth.initialize();
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      if (linkReturn.errorCode !== null) setLinkError(friendlySignInError({ code: linkReturn.errorCode }));
      else if (error !== null) setLinkError(friendlySignInError(error));

      if (linkReturn.hasSignInDetails) {
        // Keeps sign-in details out of the address bar and browser history.
        window.history.replaceState(null, '', window.location.pathname);
      }
      setAccount(accountFrom(data.session));
    }

    void finishSignIn();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccount(accountFrom(session));
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  /** Emails a sign-in link. Answers with a message to show, or null when it was sent. */
  async function sendLink(email: string): Promise<string | null> {
    setLinkError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: appAddress() },
    });
    return error === null ? null : friendlySignInError(error);
  }

  async function signOut(): Promise<void> {
    await supabase.auth.signOut();
  }

  return { account, linkError, sendLink, signOut };
}
