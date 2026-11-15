import { describe, expect, it } from 'vitest';
import {
  createVaultKey,
  DEFAULT_ITERATIONS,
  openBox,
  sealText,
  unlockWithPassphrase,
  type SealedBox,
} from './vault';

// Fewer kneading rounds than the real 600,000, only to keep these tests fast.
const FAST = 1_000;
const PASSPHRASE = 'made-up correct horse battery';
const SECRET = '{"version":1,"envelopes":[{"name":"Made-up trip","targetCents":90000}]}';

/** Flips one character of a base64 field, as tampering would. */
function tamper(text: string): string {
  const flipped = text[5] === 'A' ? 'B' : 'A';
  return text.slice(0, 5) + flipped + text.slice(6);
}

describe('vault', () => {
  it('unlocks exactly what it locked', async () => {
    const key = await createVaultKey(PASSPHRASE, FAST);
    const box = await sealText(key, SECRET);

    expect(box).toMatchObject({ version: 1, salt: key.salt, iterations: FAST });
    expect(await openBox(key, box)).toBe(SECRET);
  });

  it('reveals no patterns: same text locks differently, and never in readable form', async () => {
    const key = await createVaultKey(PASSPHRASE, FAST);
    const first = await sealText(key, SECRET);
    const second = await sealText(key, SECRET);

    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.iv).not.toBe(second.iv);
    expect(atob(first.ciphertext)).not.toContain('Made-up trip');
  });

  it('opens on another device with the right passphrase only', async () => {
    const box = await sealText(await createVaultKey(PASSPHRASE, FAST), SECRET);

    expect((await unlockWithPassphrase(PASSPHRASE, box))?.text).toBe(SECRET);
    expect(await unlockWithPassphrase('made-up correct horse batterY', box)).toBeNull();
  });

  it('refuses a box that was changed in any way', async () => {
    const key = await createVaultKey(PASSPHRASE, FAST);
    const box = await sealText(key, SECRET);
    const tampered: SealedBox[] = [
      { ...box, ciphertext: tamper(box.ciphertext) },
      { ...box, iv: tamper(box.iv) },
    ];

    for (const changed of tampered) {
      expect(await openBox(key, changed)).toBeNull();
    }
  });

  it('gives the same passphrase a different key for each salt', async () => {
    const mine = await createVaultKey(PASSPHRASE, FAST);
    const other = await createVaultKey(PASSPHRASE, FAST);
    const box = await sealText(mine, SECRET);

    expect(mine.salt).not.toBe(other.salt);
    expect(await openBox(other, box)).toBeNull();
  });

  it('works at full strength', async () => {
    const key = await createVaultKey(PASSPHRASE);
    const box = await sealText(key, SECRET);

    expect(box.iterations).toBe(DEFAULT_ITERATIONS);
    expect((await unlockWithPassphrase(PASSPHRASE, box))?.text).toBe(SECRET);
  });
});
