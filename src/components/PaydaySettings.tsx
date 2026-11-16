import { useId } from 'react';
import { DEFAULT_PAYDAY } from '../engine/timing';
import { ordinal } from '../utils/format';

interface PaydaySettingsProps {
  payday: number;
  onChange: (payday: number) => void;
}

const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

/** Settings shared by all your devices. For now: when your pay arrives. */
export function PaydaySettings({ payday, onChange }: PaydaySettingsProps) {
  const id = useId();
  return (
    <section className="settings" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="section-label">
        Settings
      </h2>
      <div className="field">
        <label htmlFor={`${id}-payday`}>Payday</label>
        {/* A list of real days can't hold an impossible value, so no error message is needed. */}
        <select
          id={`${id}-payday`}
          value={payday}
          aria-describedby={`${id}-hint`}
          onChange={(event) => onChange(Number(event.target.value))}
        >
          {DAYS.map((day) => (
            <option key={day} value={day}>
              {day === DEFAULT_PAYDAY ? '1st (plain calendar months)' : `${ordinal(day)} of the month`}
            </option>
          ))}
        </select>
        <p id={`${id}-hint`} className="field-hint">
          The day your pay usually arrives. BudgetFlow plans in paychecks: anything needed before payday is
          paid from the previous paycheck. In months without that day, payday moves to the last day.
        </p>
      </div>
    </section>
  );
}
