import type { VaultKey } from '../crypto/vault';

// Remembers this device's unlocking key so the passphrase is typed once per
// device. Kept in IndexedDB (the browser's built-in database) because, unlike
// localStorage, it can hold a real CryptoKey — which stays non-extractable:
// usable for locking and unlocking, never readable.

const DATABASE = 'budgetflow-keys';
const STORE = 'vault-keys';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Wraps IndexedDB's "when it succeeds / fails" style into a Promise. */
async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(database.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

function isVaultKey(value: unknown): value is VaultKey {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.cryptoKey instanceof CryptoKey &&
    typeof candidate.salt === 'string' &&
    typeof candidate.iterations === 'number'
  );
}

/** This device's key for this account, or null (then the passphrase is asked again). */
export async function loadVaultKey(userId: string): Promise<VaultKey | null> {
  try {
    const stored: unknown = await withStore('readonly', (store) => store.get(userId));
    return isVaultKey(stored) ? stored : null;
  } catch {
    return null;
  }
}

export async function saveVaultKey(userId: string, vaultKey: VaultKey): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.put(vaultKey, userId));
  } catch {
    // Not remembered: the passphrase will simply be asked again next time.
  }
}

/** Removes this device's key, e.g. when signing out. */
export async function forgetVaultKey(userId: string): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(userId));
  } catch {
    // Nothing stored, or storage blocked: nothing to forget.
  }
}
