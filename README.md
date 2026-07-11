# Tote

Racing accounting platform. Expenses in, penny-exact split invoices out; partnership
purses disbursed to every partner including nested syndicate members; every balance
derived from an immutable, always-balanced ledger.

See [`ROADMAP.md`](./ROADMAP.md) for the full build plan.

## Guiding invariants

These never break, in any phase. Each has a test that fails loudly if it does.

1. **Money is integer cents (`bigint`).** No float in the financial path, ever.
2. **Balances are derived** (`sum(ledger lines)`), never stored.
3. **The ledger is immutable.** Corrections post a reversing entry; nothing is edited or deleted.
4. **Every journal entry balances:** `sum(debits) == sum(credits)`.
5. **Splits are penny-exact.** Allocation uses largest-remainder; parts always sum to the whole.
6. **Tenant isolation is absolute.** No query returns another org's (or legal entity's) data.
7. **Tote never custodies funds.** Payment rails only.

## Layout

```
packages/
  core/            @tote/core — the financial spine (pure, no I/O)
    src/money/     Cents, toCents, format, splitCents, arithmetic helpers
    src/ownership/ effective-dated ownership resolver (recurses syndicate membership)
    src/ledger/    posting engine + LedgerStore port + in-memory store
    test/          unit + fast-check property tests for every invariant
  db/              @tote/db — Prisma schema, migrations, Postgres LedgerStore
    prisma/        41-model domain schema + initial migration
    src/           PrismaLedgerStore (same LedgerStore contract as core)
    test/          integration tests against a real Postgres
```

## Status — Phase 0 (Foundation)

Done and green:

- **Money layer**: `Cents` (branded bigint), `toCents`, `format`, `splitCents`
  (largest-remainder), arithmetic + `applyBps`.
- **Ownership resolver**: horse + date → effective leaf-party stakes, recursively
  resolving nested syndicates, with cycle detection and effective dating.
- **Posting engine** (`Ledger`) over an async `LedgerStore` port. Validates
  balancing, derives dimensional balances, reverses entries, computes net
  position, all bound to a single tenant.
- **Canonical posting templates** (`src/posting`): pure functions for every
  event in the appendix (vendor bill, training charge, passthrough+markup,
  payments, purse received/disbursed/credited), each with a golden test.
- **Purse disbursement engine** (the Phase 2 wedge): splits a purse's owner-net
  across owning parties, recursively resolving nested syndicates to leaf
  partners, penny-exact, and produces the balanced `purse received` posting.
- **Domain schema** (`@tote/db`): 41-model Prisma schema covering the whole
  roadmap; initial migration applied; a `PrismaLedgerStore` satisfies the exact
  same `LedgerStore` contract, so the engine and its property tests run
  unchanged against Postgres.

Property tests cover: `splitCents` always sums to the total; ownership splits of
random nested trees stay penny-exact; any posting sequence's derived balance
matches the hand-summed expected (in-memory **and** on Postgres); reversals
restore balances; no query crosses a tenant boundary.

Next in Phase 0: auth/sessions, and the multi-tenancy request middleware.

## Develop

```bash
pnpm install
pnpm db:generate          # generate the Prisma client
pnpm -r typecheck
pnpm -r test              # unit + property tests (DB integration auto-skips)

# Integration tests against a real Postgres (Docker):
pnpm test:integration     # spins up pg on :55432, migrates, runs @tote/db tests
```

Requires Node >= 18 and pnpm 9. Integration tests and migrations need Docker.
