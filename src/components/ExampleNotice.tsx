// What the top of the page shows while you have no expenses yet: either an
// explanation of the example data, or (once examples are hidden) a welcome.

interface ExampleBannerProps {
  onAddFirst: () => void;
  onHide: () => void;
}

/** Sits above the example data so made-up numbers are never mistaken for yours. */
export function ExampleBanner({ onAddFirst, onHide }: ExampleBannerProps) {
  return (
    <aside className="example-banner" aria-label="About the example">
      <p>
        <span className="example-tag">Example</span> These numbers are made up to show how BudgetFlow works.
        They disappear when you add your first expense.
      </p>
      <div className="example-banner-actions">
        <button type="button" className="button-primary" onClick={onAddFirst}>
          Add your first expense
        </button>
        <button type="button" className="button-secondary" onClick={onHide}>
          Hide examples
        </button>
      </div>
    </aside>
  );
}

interface EmptyStartProps {
  onAddFirst: () => void;
  onShowExamples: () => void;
}

/** The starting point when there are no expenses and examples are hidden. */
export function EmptyStart({ onAddFirst, onShowExamples }: EmptyStartProps) {
  return (
    <section className="empty-start" aria-labelledby="empty-start-title">
      <div>
        <h1 id="empty-start-title" className="this-month-title">
          What's coming up?
        </h1>
        <p className="empty-start-text">
          Add the one-off expenses you know are coming — a trip, new tyres, a birthday. BudgetFlow works
          out how much to put aside each month so each one is covered on time.
        </p>
      </div>
      <div className="example-banner-actions">
        <button type="button" className="button-primary" onClick={onAddFirst}>
          Add your first expense
        </button>
        <button type="button" className="button-secondary" onClick={onShowExamples}>
          Show examples
        </button>
      </div>
    </section>
  );
}
