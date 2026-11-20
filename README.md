# BudgetFlow

A personal, forward-looking expense planner. Most budgeting apps look back at what you already spent. BudgetFlow looks ahead at the one-off expenses you know are coming (presents, a booked trip, the yearly insurance bill) and tells you how much to set aside from each paycheck, and what it's for, so every one of them is paid for in time.

**Status: actively in development.** This is a solo learning project — I'm a product manager teaching myself to code, and building BudgetFlow both as a real tool I use and as the way I'm learning software engineering. Expect rough edges, WIP branches, and an evolving data model.

## How it works

- **One savings pot.** Everything you set aside goes into one pot. The app works out fresh each time which expense that money is for, so deleting an expense frees its money and a new one gets its share.
- **A flat plan per paycheck.** What each expense still needs is spread evenly over the paychecks before its deadline, in whole euros, so the amount stays as steady as possible. Deadlines always win: a bill coming up soon raises the rate rather than be missed.
- **Paycheck periods.** A savings period runs from one paycheck to the next. You tap "I got my paycheck" and log what you set aside; the app shows what's still missing this period.
- **Real life happens.** You can correct the pot's balance, take money out (with a preview of what it does to later paychecks) and pay an expense early. The plan simply re-balances.

The original algorithm is written up in [`docs/algorithm.md`](docs/algorithm.md).

## Tech stack

- **React 18 + TypeScript** — strict mode, no `any`
- **Vite** — dev server and build tooling
- **On-device storage** — your data lives in the browser (localStorage / IndexedDB) and works without an account
- **Optional sync (Supabase)** — sign in with an email code to sync between devices. Data is end-to-end encrypted with a passphrase only you know, so the server only ever stores scrambled data
- **Vitest** — the calculation engine (`src/engine/`) is pure TypeScript with no React dependency, so it's fully unit-tested in isolation from the UI

## Project structure

```
budgetflow/
├── docs/                  # Product spec and algorithm notes
├── src/
│   ├── engine/            # Pure calculation logic: the plan, the pot, paychecks, taking money out
│   ├── components/        # React UI components
│   ├── hooks/             # useEnvelopes (your data), useAccount and useSync (sign-in and sync)
│   ├── storage/           # Saving on this device, and upgrading older saved data
│   ├── crypto/            # The end-to-end encryption
│   ├── sync/              # Syncing with the server
│   └── utils/             # Formatting and display helpers
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
