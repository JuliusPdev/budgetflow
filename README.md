# BudgetFlow

A personal, forward-looking expense planner. Instead of just tracking what you've already spent, BudgetFlow looks ahead at every expense you know is coming — rent, insurance, that flight you already booked — and tells you the largest amount you can safely spend today while still guaranteeing every future expense is fully funded by its deadline.

**Status: actively in development.** This is a solo learning project — I'm a product manager teaching myself to code, and building BudgetFlow both as a real tool I use and as the way I'm learning software engineering. Expect rough edges, WIP branches, and an evolving data model.

## How it works

At its core, BudgetFlow runs a smoothing algorithm over your known future expenses:

- It spreads the amount you need to save for each upcoming expense evenly across the months between now and its deadline, so your required monthly set-aside stays as flat and predictable as possible.
- It never asks you to save more than necessary — surplus from past months reduces future requirements, but it won't recommend saving early "just in case."
- Deadlines always win: if a big expense is coming up soon, the algorithm raises your recommended set-aside rate rather than let you miss it.
- What you've actually locked away (transferred to savings) is treated as ground truth. The app tracks the gap between what's recommended and what's actually locked, not a theoretical ideal.

The full algorithm is written up in [`docs/algorithm.md`](docs/algorithm.md).

## Tech stack

- **React 18 + TypeScript** — strict mode, no `any`
- **Vite** — dev server and build tooling
- **localStorage** — all data stays on your device; there's no backend or account system
- **Vitest** — the calculation engine (`src/engine/`) is pure TypeScript with no React dependency, so it's fully unit-tested in isolation from the UI

## Project structure

```
budgetflow/
├── docs/
│   └── algorithm.md       # The smoothing algorithm, in detail
├── src/
│   ├── engine/            # Pure calculation logic, no React — takes data in, returns results
│   ├── components/        # React UI components
│   ├── hooks/              # useBudgetState — the app's state management
│   └── utils/              # Formatting, storage, display helpers
```

## Running it locally

```bash
npm install
npm run dev      # starts the dev server
npm test         # runs the engine + utility test suite
npm run build    # type-checks and produces a production build
```

## License

All rights reserved. This is a personal project shared for visibility into ongoing progress — not licensed for reuse.
