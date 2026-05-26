export type LedgerSectionId = 'income' | 'fixed' | 'savings' | 'spent' | 'planned';

const STORAGE_KEY = 'budgetflow-ledger-sections';

const DEFAULTS: Record<LedgerSectionId, boolean> = {
  income: false,
  fixed: false,
  savings: false,
  spent: true,
  planned: true,
};

export function loadLedgerSectionExpanded(): Record<LedgerSectionId, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Record<LedgerSectionId, boolean>>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveLedgerSectionExpanded(sections: Record<LedgerSectionId, boolean>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sections));
  } catch {
    // localStorage may be unavailable in private browsing
  }
}
