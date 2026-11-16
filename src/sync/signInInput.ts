// Small pure helpers for signing in by emailed link: a quick check on the
// email you type (instant feedback, no network), reading what Supabase puts
// in the address when you come back from the link, and plain-language errors.

/** Loose on purpose: the email itself is the real test. */
export function isPlausibleEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());
}

export function normalizeEmail(text: string): string {
  return text.trim().toLowerCase();
}

/** How long to wait after sending a link, so quick re-taps can't use up the hourly email allowance. */
export const RESEND_WAIT_MS = 60_000;

/** Whole seconds left until `until`, rounded up so it never shows 0 while still waiting. */
export function secondsUntil(until: number, now: number): number {
  return Math.max(0, Math.ceil((until - now) / 1000));
}

/** The address-bar details Supabase adds when it sends you back from a link. */
const RETURN_PARAMS = ['code', 'error', 'error_code', 'error_description'];

export interface LinkReturn {
  /** True when the address carries any sign-in details that should be tidied away. */
  hasSignInDetails: boolean;
  /** Set when the link didn't work, e.g. "otp_expired". */
  errorCode: string | null;
}

/** Reads the sign-in details from the part of the address after "?" (and "#"). */
export function readLinkReturn(search: string, hash = ''): LinkReturn {
  const params = new URLSearchParams(search);
  new URLSearchParams(hash.replace(/^#/, '')).forEach((value, key) => params.set(key, value));
  const hasSignInDetails = RETURN_PARAMS.some((name) => params.has(name));
  const errorCode = params.get('error_code') ?? params.get('error');
  return { hasSignInDetails, errorCode };
}

/** The parts of a sign-in error worth reacting to. */
export interface SignInErrorInfo {
  status?: number;
  code?: string;
}

/** Turns the sync service's technical errors into something to act on. */
export function friendlySignInError(error: SignInErrorInfo): string {
  if (error.status === 0 || error.code === 'network_error') {
    return "Couldn't reach the sync service. Check your connection. If BudgetFlow hasn't been used for a week, the sync database may be asleep: wake it in the Supabase dashboard.";
  }
  if (error.status === 429 || error.code === 'over_email_send_rate_limit') {
    return "Supabase's free email service sends only about 2 sign-in emails per hour. Wait up to an hour and try once more, and check your spam folder for the earlier email first.";
  }
  if (error.code === 'signup_disabled') {
    return 'New accounts are switched off for this BudgetFlow.';
  }
  if (error.code === 'otp_expired' || error.code === 'access_denied' || error.status === 403) {
    return 'That sign-in link has expired or was already used. Send a new one.';
  }
  if (error.code === 'flow_state_not_found' || error.code === 'bad_code_verifier') {
    return 'Open the sign-in link in the same browser you requested it from.';
  }
  return 'Something went wrong signing in. Try again in a moment.';
}
