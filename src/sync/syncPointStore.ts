import type { SyncPoint } from './syncCore';

// Remembers, per device, the last moment this device and the server agreed:
// the server's revision and a fingerprint of the list. Only codes and numbers,
// no expenses.

const SYNC_POINT_KEY = 'budgetflow.syncPoint';

export function loadSyncPoint(userId: string): SyncPoint | null {
  try {
    const raw = window.localStorage.getItem(SYNC_POINT_KEY);
    if (raw === null) return null;
    const stored = JSON.parse(raw) as Record<string, unknown>;
    // A point saved for a different account doesn't count.
    if (stored.userId !== userId) return null;
    if (typeof stored.revision !== 'number' || typeof stored.fingerprint !== 'string') return null;
    return { revision: stored.revision, fingerprint: stored.fingerprint };
  } catch {
    return null;
  }
}

export function saveSyncPoint(userId: string, point: SyncPoint): void {
  try {
    window.localStorage.setItem(SYNC_POINT_KEY, JSON.stringify({ userId, ...point }));
  } catch {
    // Not remembered: next start compares afresh and may ask which copy to keep.
  }
}

export function clearSyncPoint(): void {
  try {
    window.localStorage.removeItem(SYNC_POINT_KEY);
  } catch {
    // Nothing to clear.
  }
}
