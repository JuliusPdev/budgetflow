import type { BudgetState } from '../../engine/types';
import type { SubAccountMapping, SubAccountMappings, SubAccountMappingType } from '../../engine/csvImportTypes';

const TYPE_OPTIONS: { value: SubAccountMappingType; label: string }[] = [
  { value: 'checking', label: 'Main checking (free budget)' },
  { value: 'envelope', label: 'Envelope' },
  { value: 'pot', label: 'Pot account' },
  { value: 'savings', label: 'Savings account' },
  { value: 'ignore', label: 'Ignore' },
];

interface Props {
  kontonamen: string[];
  draft: SubAccountMappings;
  onDraftChange: (m: SubAccountMappings) => void;
  budget: BudgetState;
}

export default function SubAccountMappingStep({
  kontonamen,
  draft,
  onDraftChange,
  budget,
}: Props) {

  const envelopes = budget.fixedExpenses.filter(e => e.isEnvelope);
  const targetGoals = budget.savingsGoals.filter(
    (g): g is Extract<typeof g, { mode: 'target' }> => g.mode === 'target',
  );

  function setMapping(name: string, patch: Partial<SubAccountMapping>) {
    onDraftChange({
      ...draft,
      [name]: { ...draft[name], ...patch },
    });
  }

  return (
    <div className="csv-step">
      <p className="csv-step-intro">
        Match each C24 sub-account (Kontoname) to a BudgetFlow concept. This is saved for future imports.
      </p>
      <ul className="csv-mapping-list">
        {kontonamen.map(name => {
          const m = draft[name] ?? { type: 'checking' as const };
          return (
            <li key={name} className="csv-mapping-row">
              <span className="csv-mapping-name">{name}</span>
              <select
                className="csv-select"
                value={m.type}
                onChange={e => {
                  const type = e.target.value as SubAccountMappingType;
                  setMapping(name, { type, linkedId: undefined });
                }}
              >
                {TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {m.type === 'envelope' && (
                <select
                  className="csv-select"
                  value={m.linkedId ?? ''}
                  onChange={e => setMapping(name, { linkedId: e.target.value })}
                >
                  <option value="">Select envelope…</option>
                  {envelopes.map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              )}
              {m.type === 'savings' && (
                <select
                  className="csv-select"
                  value={m.linkedId ?? ''}
                  onChange={e => setMapping(name, { linkedId: e.target.value })}
                >
                  <option value="">Select goal…</option>
                  {targetGoals.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
