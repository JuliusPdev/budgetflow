import { describe, expect, it } from 'vitest';
import { isSealedBox } from './remoteVault';

describe('isSealedBox', () => {
  const box = { version: 1, salt: 'c2FsdA==', iterations: 600_000, iv: 'aXY=', ciphertext: 'Y2lwaGVy' };

  it('accepts a sealed box', () => {
    expect(isSealedBox(box)).toBe(true);
  });

  it('refuses anything else', () => {
    for (const value of [null, 'text', { ...box, version: 2 }, { ...box, iterations: 0 }, { ...box, iv: 5 }]) {
      expect(isSealedBox(value)).toBe(false);
    }
  });
});
