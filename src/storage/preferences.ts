// Display preferences for this device — not financial data. They skip the
// envelope store on purpose: losing one costs nothing, and even with a server
// later you may want a different choice on each device.

const HIDE_EXAMPLES_KEY = 'budgetflow.hideExamples';

export function loadHideExamples(): boolean {
  try {
    return window.localStorage.getItem(HIDE_EXAMPLES_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveHideExamples(hide: boolean): void {
  try {
    window.localStorage.setItem(HIDE_EXAMPLES_KEY, String(hide));
  } catch {
    // Only a preference: if the browser blocks storage, it simply isn't remembered.
  }
}
