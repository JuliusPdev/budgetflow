import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './supabaseConfig';

// The one connection to the sync service, created once and shared.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    // The sign-in pass lives under its own label, apart from your expenses.
    storageKey: 'budgetflow.session',
    persistSession: true,
    autoRefreshToken: true,
    // Sign-in is by emailed link: when you come back from it, finish signing in.
    detectSessionInUrl: true,
    // PKCE: the browser that asked for the link keeps a secret half, so only it
    // can complete the sign-in — an intercepted link is useless elsewhere.
    flowType: 'pkce',
  },
});

/** Where the sign-in link should bring you back to: this app, local or published. */
export function appAddress(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href;
}
