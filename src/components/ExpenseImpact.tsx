import type { ExpensePreview } from '../engine/expensePreview';
import { groupChanges } from '../engine/takeOut';
import type { Month } from '../engine/types';
import { formatEuros } from '../utils/format';

interface ExpenseImpactProps {
  /** Missing until the form has a name, an amount and a due date. */
  preview: ExpensePreview | null;
  /** How a paycheck is named, e.g. "21 Dec". */
  paycheckLabel: (month: Month) => string;
  /** "paycheck" with a payday set, "month" without. */
  unit: 'paycheck' | 'month';
}

function range(from: string, to: string): string {
  return from === to ? from : `${from} – ${to}`;
}

/**
 * What saving this expense would change, shown live while you fill in the
 * form: this paycheck, later paychecks, and the expense's own share. Like
 * "What it costs you" when taking money out: nothing changes until you save.
 */
export function ExpenseImpact({ preview, paycheckLabel, unit }: ExpenseImpactProps) {
  if (preview === null) {
    return (
      <section className="cost-preview expense-impact" aria-live="polite">
        <p className="cost-title">What it changes</p>
        <p className="field-hint">Fill in the amount and when it's due to see how your plan would change.</p>
      </section>
    );
  }

  const { openBeforeCents, openAfterCents, laterChanges, ownShares } = preview;
  const ownTotal = ownShares.reduce((sum, share) => sum + share.cents, 0);
  const evenShares = ownShares.every((share) => Math.abs(share.cents - ownShares[0].cents) <= 100);
  const first = ownShares[0];
  const last = ownShares[ownShares.length - 1];
  const nothingChanges = openBeforeCents === openAfterCents && laterChanges.length === 0;

  return (
    <section className="cost-preview expense-impact" aria-live="polite">
      <p className="cost-title">What it changes</p>

      {nothingChanges ? (
        <p className="cost-notes">Your pot already covers it. Your plan doesn't change.</p>
      ) : (
        <>
          <p className="cost-row">
            <span>Still to put aside this {unit}</span>
            <span className="figures">
              {openBeforeCents === openAfterCents ? (
                <>{formatEuros(openAfterCents)} · no change</>
              ) : (
                <>
                  <span className="cost-before">{formatEuros(openBeforeCents)}</span>
                  {' → '}
                  <strong>{formatEuros(openAfterCents)}</strong>
                </>
              )}
            </span>
          </p>
          {laterChanges.length > 0 && (
            <>
              <p className="cost-label">Later {unit}s:</p>
              <ul className="cost-list">
                {groupChanges(laterChanges).map((run) => (
                  <li key={run.from} className="cost-row">
                    <span>{range(paycheckLabel(run.from), paycheckLabel(run.to))}</span>
                    <span className="figures">
                      <span className="cost-before">{formatEuros(run.beforeCents)}</span>
                      {' → '}
                      <strong>{formatEuros(run.afterCents)}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {first !== undefined && last !== undefined && (
        <p className="cost-notes">
          {evenShares && ownShares.length > 1
            ? `This expense: ${formatEuros(first.cents)} from each of ${ownShares.length} ${unit}s, ${range(paycheckLabel(first.month), paycheckLabel(last.month))}.`
            : `This expense: ${formatEuros(ownTotal)} over ${ownShares.length === 1 ? `one ${unit}` : `${ownShares.length} ${unit}s`}, ${range(paycheckLabel(first.month), paycheckLabel(last.month))}.`}
        </p>
      )}
    </section>
  );
}
