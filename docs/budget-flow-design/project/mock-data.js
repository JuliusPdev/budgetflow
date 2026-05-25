// Shared mock budget data for all variations.
// Numbers chosen to feel realistic and exercise every UI state.
window.MOCK = (function () {
  const fmt = (n) => '€' + Math.round(n).toLocaleString('en-US');
  const fmt2 = (n) => '€' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const months = [
    { key: '2026-04', label: 'Apr',  long: 'April 2026',     state: 'past'    },
    { key: '2026-05', label: 'May',  long: 'May 2026',       state: 'current' },
    { key: '2026-06', label: 'Jun',  long: 'June 2026',      state: 'future'  },
    { key: '2026-07', label: 'Jul',  long: 'July 2026',      state: 'future'  },
    { key: '2026-08', label: 'Aug',  long: 'August 2026',    state: 'future'  },
    { key: '2026-09', label: 'Sep',  long: 'September 2026', state: 'future'  },
    { key: '2026-10', label: 'Oct',  long: 'October 2026',   state: 'future'  },
    { key: '2026-11', label: 'Nov',  long: 'November 2026',  state: 'future'  },
    { key: '2026-12', label: 'Dec',  long: 'December 2026',  state: 'future'  },
  ];

  const income = 3200;
  const fixed = [
    { id: 'rent',   name: 'Rent',             amount: 1100, envelope: false },
    { id: 'health', name: 'Health insurance', amount: 280,  envelope: false },
    { id: 'gym',    name: 'Gym',              amount: 40,   envelope: false },
    { id: 'phone',  name: 'Phone plan',       amount: 25,   envelope: false },
    { id: 'spot',   name: 'Spotify',          amount: 15,   envelope: false },
    { id: 'groc',   name: 'Groceries',        amount: 450,  envelope: true  },
  ];
  const fixedTotal = fixed.reduce((s, e) => s + e.amount, 0);

  const modeBSavings = [
    { id: 'rainy', name: 'Rainy day fund', amount: 200 },
  ];

  const planned = [
    { id: 'car',  name: 'Car service',     amount: 350,  month: '2026-07', current: 0,    target: 350 },
    { id: 'lis',  name: 'Trip to Lisbon',  amount: 900,  month: '2026-08', current: 312,  target: 900 },
    { id: 'lap',  name: 'New laptop',      amount: 1800, month: '2026-11', current: 415,  target: 1800 },
    { id: 'xmas', name: 'Christmas gifts', amount: 400,  month: '2026-12', current: 92,   target: 400 },
  ];

  const savingsGoals = [
    { id: 'house',  name: 'House down payment', mode: 'target',  current: 8200, target: 25000, deadline: '2028-06' },
    { id: 'bike',   name: 'New bicycle',        mode: 'target',  current: 480,  target: 1200,  deadline: '2026-10' },
    { id: 'rainy2', name: 'Rainy day fund',     mode: 'monthly', monthlyAmount: 200 },
  ];

  // Per-month numbers — illustrative, not strictly algorithm-derived.
  // freeBudget, setAside, pot represent the engine's output state for each month.
  const monthData = {
    '2026-04': { freeBudget: 612, setAside: 540, pot: 945,  locked: 540, unplannedTotal: 218 },
    '2026-05': { freeBudget: 685, setAside: 520, pot: 1240, locked: 350, unplannedTotal: 127 },
    '2026-06': { freeBudget: 710, setAside: 520, pot: 1410, locked: 0,   unplannedTotal: 0   },
    '2026-07': { freeBudget: 698, setAside: 520, pot: 1580, locked: 0,   unplannedTotal: 0   },
    '2026-08': { freeBudget: 698, setAside: 520, pot: 1200, locked: 0,   unplannedTotal: 0   },
    '2026-09': { freeBudget: 705, setAside: 520, pot: 1380, locked: 0,   unplannedTotal: 0   },
    '2026-10': { freeBudget: 705, setAside: 520, pot: 1560, locked: 0,   unplannedTotal: 0   },
    '2026-11': { freeBudget: 705, setAside: 520, pot: 180,  locked: 0,   unplannedTotal: 0   },
    '2026-12': { freeBudget: 705, setAside: 520, pot: 0,    locked: 0,   unplannedTotal: 0   },
  };

  // Per-month planned expense lists (which planned items fall in which month).
  const plannedByMonth = {
    '2026-07': [planned[0]],
    '2026-08': [planned[1]],
    '2026-11': [planned[2]],
    '2026-12': [planned[3]],
  };

  // Current month spent items
  const spentThisMonth = [
    { id: 's1', name: 'Coffee shop',     amount: 32 },
    { id: 's2', name: 'Dinner with Sam', amount: 68 },
    { id: 's3', name: 'Books',           amount: 27 },
  ];

  return {
    fmt, fmt2,
    income, fixed, fixedTotal, modeBSavings,
    months, monthData, plannedByMonth, planned, spentThisMonth,
    savingsGoals,
    currentMonth: '2026-05',
    setAsideRecommended: 520,
    setAsideLocked: 350,
    setAsideStill: 170,        // 520 - 350
    freeBudget: 685,
    potBalance: 1240,
  };
})();
