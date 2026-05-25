import type { AppState } from '../engine/types';

const STORAGE_KEY = 'budgetflow-v1';

export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    return JSON.parse(raw) as AppState;
  } catch {
    // Corrupted data — treat as empty so the app can start fresh.
    return null;
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage can be unavailable in some private-browsing modes.
    // Fail silently — the app still works, data just won't persist.
  }
}

export function clearState(): void {
  localStorage.removeItem(STORAGE_KEY);
}
