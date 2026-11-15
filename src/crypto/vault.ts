// End-to-end encryption for synced data. Everything here runs on your device
// with the browser's built-in crypto (crypto.subtle); the online database only
// ever receives sealed boxes it cannot open.
//
//   passphrase + salt ──PBKDF2 (slow, on purpose)──► key
//   key + fresh IV + text ──AES-GCM──► sealed box (tamper-evident)

/** Kneading rounds for the passphrase. High on purpose: each guess costs a thief this much. */
export const DEFAULT_ITERATIONS = 600_000;

/** A ready-to-use key, plus what another device needs to rebuild it from the passphrase. */
export interface VaultKey {
  /** Non-extractable: usable for locking and unlocking, but never readable or leakable. */
  cryptoKey: CryptoKey;
  salt: string;
  iterations: number;
}

/** What gets stored online: everything needed to unlock it except the passphrase. */
export interface SealedBox {
  version: 1;
  salt: string;
  iterations: number;
  iv: string;
  ciphertext: string;
}

// Raw bytes ↔ text, because the database stores text.
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const passphraseMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    passphraseMaterial,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable
    ['encrypt', 'decrypt'],
  );
}

/** A brand-new key with a fresh random salt — used once, when sync is first set up. */
export async function createVaultKey(passphrase: string, iterations = DEFAULT_ITERATIONS): Promise<VaultKey> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { cryptoKey: await deriveKey(passphrase, salt, iterations), salt: toBase64(salt), iterations };
}

/** Locks text into a sealed box. A fresh IV each time, so identical text never looks identical. */
export async function sealText(vaultKey: VaultKey, text: string): Promise<SealedBox> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    vaultKey.cryptoKey,
    new TextEncoder().encode(text),
  );
  return {
    version: 1,
    salt: vaultKey.salt,
    iterations: vaultKey.iterations,
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encrypted)),
  };
}

/** Unlocks a sealed box, or null if the key doesn't fit or the box was tampered with. */
export async function openBox(vaultKey: VaultKey, box: SealedBox): Promise<string | null> {
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(box.iv) },
      vaultKey.cryptoKey,
      fromBase64(box.ciphertext),
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    // AES-GCM's seal failed: wrong passphrase, or the data was changed.
    return null;
  }
}

/**
 * On another device: rebuilds the key from the passphrase and the box's salt,
 * then tries it. Null means the passphrase is wrong.
 */
export async function unlockWithPassphrase(
  passphrase: string,
  box: SealedBox,
): Promise<{ vaultKey: VaultKey; text: string } | null> {
  const vaultKey: VaultKey = {
    cryptoKey: await deriveKey(passphrase, fromBase64(box.salt), box.iterations),
    salt: box.salt,
    iterations: box.iterations,
  };
  const text = await openBox(vaultKey, box);
  return text === null ? null : { vaultKey, text };
}
