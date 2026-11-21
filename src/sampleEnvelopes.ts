import { addMonths } from './engine/months';
import type { Envelope, Month } from './engine/types';

// TEMPORARY: made-up envelopes so the screen has something to show until
// adding and editing your own arrives (step 4). Dates are relative to the
// current month so the example never drifts into the past.
export function sampleEnvelopes(currentMonth: Month): Envelope[] {
  return [
    {
      id: 'sample-trip',
      name: 'Flights to Lisbon',
      targetCents: 90_000,
      dueMonth: addMonths(currentMonth, 2),
      savedCents: 30_000,
      // Booked early: the remaining €600 was borrowed from the pot.
      paidMonth: currentMonth,
    },
    {
      id: 'sample-tyres',
      name: 'Winter tyres',
      targetCents: 48_000,
      dueMonth: addMonths(currentMonth, 3),
      savedCents: 12_000,
    },
    {
      id: 'sample-emergency',
      name: 'Refill emergency fund',
      targetCents: 100_000,
      dueMonth: addMonths(currentMonth, 6),
      savedCents: 0,
    },
    {
      id: 'sample-laptop',
      name: 'New laptop',
      targetCents: 140_000,
      dueMonth: addMonths(currentMonth, 9),
      savedCents: 20_000,
    },
  ];
}
