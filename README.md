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
    src/           PrismaLedgerStore (same contract as core) + seed
    test/          integration tests against a real Postgres
apps/
  web/             @tote/web — Next.js app (staff console + owner portal)
    app/           dashboard, horses, owners, vendor bills, invoices, purses, portal
    lib/           auth (sessions), tenant context, ledger wiring, ownership loader
    components/    fintech design system (cards, tables, stat tiles)
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

### Web app (`@tote/web`)

A Next.js 14 App Router app on the Postgres ledger, with a fintech-clean design
system (turf-green brand, light/dark):

- **Auth** — session cookies over the `User`/`Session` models (bcrypt),
  role-routed: staff → console, owners → portal.
- **Multi-tenant** — every page resolves org + active legal entity; an entity
  switcher swaps books. No query crosses the boundary.
- **Staff console** — dashboard (derived balances), horses (ownership resolver
  shown live, syndicates expanded to leaf partners), owners (net position +
  statement), vendor bills (create → posts to the ledger), invoices/statements,
  and purses (record → penny-exact disbursement across nested partners).
- **Owner portal** — read-only holdings, net position, and statement, scoped to
  the owner's own party.

Everything on screen is derived from the immutable ledger and reconciles to the
penny.

## Develop

```bash
pnpm install
pnpm db:up                # ephemeral Postgres on :55432 (Docker)
pnpm db:generate          # generate the Prisma client
pnpm db:migrate           # apply migrations
pnpm db:seed              # demo barn (staff@meadowbrook.test / tote1234)
pnpm dev                  # web app on :3000

pnpm -r typecheck
pnpm -r test              # unit + property tests (DB integration auto-skips)
pnpm test:integration     # migrates + runs @tote/db tests against Postgres
```

Requires Node >= 18 and pnpm 9. The DB, migrations, and integration tests need Docker.
