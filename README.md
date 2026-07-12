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
    src/posting/   canonical posting templates + purse disbursement engine
  db/              @tote/db — Prisma schema, migrations, Postgres LedgerStore, seed
  services/        @tote/services — application use-cases over the ledger:
                   billing (monthly run), payments, purse net, CSV import, payment
                   rail + webhooks, GL export, reconciliation, racing, operations,
                   asset/tax, balance checkpoints
apps/
  web/             @tote/web — Next.js 14 app (staff console + owner portal + PWA capture)
  intelligence/    FastAPI service — receipt OCR draft, cash-flow forecast, horse ROI
```

## Status — all phases complete

Every phase's Definition of Done is met, tested, and verified end-to-end.
**25 TypeScript tests** (unit + fast-check property + Postgres integration) and
**11 pytest** tests, all green; CI runs typecheck, migrations, and both suites.

- **Phase 0 — Foundation.** Money layer, effective-dated ownership resolver,
  immutable posting engine (`postEntry`/`balanceOf`/`reverseEntry`/`netPosition`),
  41-model Prisma schema, `PrismaLedgerStore`. Invariants 1–6 property-tested
  in-memory **and** on Postgres.
- **Phase 1 — Billing loop.** Idempotent monthly invoice run (training +
  vendor-bill passthrough, split by ownership), payments, CSV import wizard
  (creates missing entities), owner portal.
- **Phase 2 — Purse disbursement.** Recursive nested-syndicate disbursement,
  per-partner net position, net-against-invoice.
- **Phase 3 — Payments, statements, GL.** Provider-agnostic payment rail +
  sandbox provider, signature-verified webhooks (rails-only — Tote holds
  nothing), QuickBooks general-journal export, bank reconciliation.
- **Phase 4 — Racing.** Stakes ladders with firing-deadline reminders; jockey
  fees flowing into purse distribution.
- **Phase 5 — Operations.** Payroll → ledger, AP aging, transportation cost
  split, insurance premiums + claim recoveries.
- **Phase 6 — Asset & tax.** Horse purchase/sale gain-loss, depreciation
  schedules, 1099-NEC, owner year-end tax packs.
- **Phase 7 — Intelligence (FastAPI).** Receipt → draft vendor bill, 90-day
  cash-flow forecast, horse ROI. See [`apps/intelligence`](./apps/intelligence).
- **Phase 8 — Scale & mobile.** Balance checkpoints (checkpoint + replay-forward,
  derived truth preserved), PWA offline barn capture, instant multi-entity switching.

### Web app (`@tote/web`)

Next.js 14 App Router on the Postgres ledger, fintech-clean design system
(turf-green brand, light/dark). Staff console (dashboard, horses, owners, vendor
bills, invoices, purses, racing, operations, tax, insights, import, reconcile,
exports, barn capture), an owner portal with online payment, and an installable
PWA for barn-side capture. Everything on screen is derived from the immutable
ledger and reconciles to the penny.

## Develop

```bash
pnpm install
pnpm db:up                # ephemeral Postgres on :55432 (Docker)
pnpm db:generate          # generate the Prisma client
pnpm db:migrate           # apply migrations
pnpm db:seed              # demo barn (staff@meadowbrook.test / tote1234)
pnpm dev                  # web app on :3000

pnpm -r typecheck
pnpm -r test              # unit + property tests (DB integration auto-skips without a DB)
pnpm test:integration     # migrates + runs integration tests against Postgres

# Intelligence service (Phase 7)
cd apps/intelligence && python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt && pytest
DATABASE_URL=postgresql://tote:tote@localhost:55432/tote uvicorn app.main:app --port 8000
```

Requires Node >= 18, pnpm 9, and Python 3.9+. The DB, migrations, and
integration tests need Docker. Set `INTELLIGENCE_URL` in `apps/web/.env.local`
(e.g. `http://127.0.0.1:8000`) to light up the Insights page.
