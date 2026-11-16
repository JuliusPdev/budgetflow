import { describe, expect, it } from 'vitest';
import { friendlySignInError, isPlausibleEmail, normalizeEmail, readLinkReturn, secondsUntil } from './signInInput';

describe('sign-in input', () => {
  it('accepts ordinary email addresses and catches obvious typos', () => {
    expect(isPlausibleEmail(' someone@example.com ')).toBe(true);
    for (const typo of ['someone@example', 'someone.example.com', 'some one@example.com', '']) {
      expect(isPlausibleEmail(typo)).toBe(false);
    }
  });

  it('tidies an email address', () => {
    expect(normalizeEmail('  Someone@Example.COM ')).toBe('someone@example.com');
  });
});

describe('coming back from a sign-in link', () => {
  it('notices a successful return', () => {
    expect(readLinkReturn('?code=made-up-code')).toEqual({ hasSignInDetails: true, errorCode: null });
  });

  it('notices an expired link, in the query or after "#"', () => {
    const query = '?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid';
    expect(readLinkReturn(query).errorCode).toBe('otp_expired');
    expect(readLinkReturn('', '#error_code=otp_expired').errorCode).toBe('otp_expired');
  });

  it('ignores an ordinary visit', () => {
    expect(readLinkReturn('', '')).toEqual({ hasSignInDetails: false, errorCode: null });
  });
});

describe('friendlySignInError', () => {
  it('explains sign-in errors in plain words', () => {
    expect(friendlySignInError({ status: 0 })).toMatch(/Couldn't reach the sync service/);
    expect(friendlySignInError({ status: 429, code: 'over_email_send_rate_limit' })).toMatch(/about 2 sign-in emails per hour/);
    expect(friendlySignInError({ code: 'otp_expired' })).toMatch(/expired or was already used/);
    expect(friendlySignInError({ code: 'bad_code_verifier' })).toMatch(/same browser/);
    expect(friendlySignInError({ status: 422, code: 'signup_disabled' })).toMatch(/switched off/);
    expect(friendlySignInError({ status: 500 })).toMatch(/Something went wrong/);
  });
});

describe('secondsUntil', () => {
  it('counts down in whole seconds, rounding up, and stops at zero', () => {
    expect(secondsUntil(60_000, 0)).toBe(60);
    expect(secondsUntil(60_000, 59_001)).toBe(1);
    expect(secondsUntil(60_000, 60_000)).toBe(0);
    expect(secondsUntil(60_000, 75_000)).toBe(0);
  });
});
