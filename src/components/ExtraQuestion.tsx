import type { ExtraFrom } from '../engine/payments';
import type { Cents } from '../engine/types';
import { formatEuros } from '../utils/format';

interface ExtraQuestionProps {
  /** Ties the answers together and to the error; the first answer gets `${id}-pot`. */
  id: string;
  extraCents: Cents;
  value: ExtraFrom | null;
  onChange: (value: ExtraFrom) => void;
  /** What answering "The pot" means here. */
  potHint: string;
  /** What answering "My spending money" means here. */
  spendingHint: string;
  error?: string;
}

/** "Where did the extra come from?" — asked when something costs more than planned, when paying or finishing it. */
export function ExtraQuestion({ id, extraCents, value, onChange, potHint, spendingHint, error }: ExtraQuestionProps) {
  return (
    <fieldset className="field field--wide done-extra" aria-describedby={error !== undefined ? `${id}-error` : undefined}>
      <legend>Where did the extra {formatEuros(extraCents)} come from?</legend>
      <label className="done-choice">
        <input id={`${id}-pot`} type="radio" name={id} checked={value === 'pot'} onChange={() => onChange('pot')} />
        <span>
          The pot
          <span className="field-hint">{potHint}</span>
        </span>
      </label>
      <label className="done-choice">
        <input type="radio" name={id} checked={value === 'spending'} onChange={() => onChange('spending')} />
        <span>
          My spending money
          <span className="field-hint">{spendingHint}</span>
        </span>
      </label>
      {error !== undefined && (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
