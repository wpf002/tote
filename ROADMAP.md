# Tote — Full Build Roadmap

Racing accounting platform. This is the complete plan from scaffold to production SaaS: every phase, the cross-cutting work that runs alongside them, the posting rules the accounting depends on, and the gate that has to close before the next phase starts.

## How to read this

- **Phases are dependency-ordered, not time-boxed.** A phase starts when the prior phase's Definition of Done is met.
- **Cross-cutting workstreams run continuously** alongside every phase.
- The build principle throughout: **model broadly, build narrowly.**

---

## Guiding invariants

1. **Money is integer cents (`BigInt`).** No float in the financial path, ever.
2. **Balances are derived** (`sum(ledger lines)`), never stored.
3. **The ledger is immutable.** Corrections post a reversing entry.
4. **Every journal entry balances:** `sum(debits) == sum(credits)`.
5. **Splits are penny-exact.** Allocation uses largest-remainder.
6. **Tenant isolation is absolute.**
7. **Tote never custodies funds.** Payment rails only.

---

## Phase 0 — Foundation (the spine)

- Monorepo scaffold; domain schema (40 models) + initial migration.
- `@tote/core` money layer: `Cents`, `toCents`, `format`, `splitCents` + `Money` helpers.
- **Ownership resolver:** horse + date → effective basis-point map, recursively resolving syndicate membership.
- **Posting engine:** `postEntry`, `balanceOf`, `reverseEntry`, `netPosition`.
- **Auth & sessions**, **multi-tenancy middleware**, **test harness** (Vitest + fast-check + ephemeral Postgres), **CI**, config/logging/errors/secrets.

**Definition of Done:** post a balanced entry, read a correct derived balance and net position, reverse an entry to zero, under enforced tenant isolation, with green CI and passing property tests.

---

## Phase 1 — Core billing loop

Vendor-bills-the-horse flow, auto training charges, monthly invoice run (idempotent), payments in, fast horse search, CSV/XLS import wizard, read-only owner portal.

## Phase 2 — Partnership purse disbursement (the wedge)

Purse entry, recursive disbursement engine (nested syndicates), per-party net position, net-against-invoice.

## Phase 3 — Payments, statements, GL export

Payment rail (rails-only), webhooks, PDF statements, QuickBooks export, bank reconciliation.

## Phase 4 — Racing depth

Race entries/fees, stakes schedules with reminders, jockey bookings, race-result ingestion.

## Phase 5 — Operational breadth

Payroll, AP aging, transportation, insurance, light inventory.

## Phase 6 — Asset & tax

Horse purchase/sale gain-loss, depreciation, tax forms, tax reports.

## Phase 7 — Intelligence (FastAPI enters here)

Receipt OCR, cash-flow forecasting, owner ROI/risk dashboards.

## Phase 8 — Mobile, scale, hardening

Mobile barn-side capture, balance snapshots if needed, multi-entity polish, load/soak testing.

---

## Validation gates (dogfood-first)

- **Gate A — after Phase 1:** a real barn runs a complete billing month; the numbers reconcile.
- **Gate B — after Phase 2:** a real syndicate trusts the per-partner purse numbers.
- **Gate C — after Phase 3:** money moves end-to-end without Tote touching funds.

---

## Appendix — canonical posting templates

| Event | Debit | Credit |
|---|---|---|
| Vendor bill approved | OPERATING_EXPENSE (Vet, horse) | ACCOUNTS_PAYABLE (vendor) |
| Pay vendor | ACCOUNTS_PAYABLE (vendor) | CASH |
| Training charge (invoice) | ACCOUNTS_RECEIVABLE (owner) | OPERATING_INCOME (Training, horse) |
| Passthrough + markup (invoice) | ACCOUNTS_RECEIVABLE (owner) | OPERATING_EXPENSE (recover) + OPERATING_INCOME (markup) |
| Owner payment in | CASH | ACCOUNTS_RECEIVABLE (owner) |
| Purse received | CASH | OWNER_PURSE_PAYABLE (per partner) + PURSE_REVENUE (trainer cut) |
| Purse disbursed | OWNER_PURSE_PAYABLE (partner) | CASH |
| Purse credited to invoice | OWNER_PURSE_PAYABLE (partner) | ACCOUNTS_RECEIVABLE (partner) |
| Payroll approved | OPERATING_EXPENSE (Labor) | WAGES_PAYABLE (employee) |
| Payroll paid | WAGES_PAYABLE (employee) | CASH |
| Insurance premium | OPERATING_EXPENSE (Insurance, horse) | CASH / ACCOUNTS_PAYABLE |
| Insurance claim recovery | CASH / ACCOUNTS_RECEIVABLE | OPERATING_INCOME (Recovery, horse) |
| Horse purchase | HORSE_ASSET (cost basis) | CASH |
| Horse sale (gain) | CASH | HORSE_ASSET (basis) + OPERATING_INCOME (gain) |
| Owner deposit | CASH | OWNER_DEPOSITS (owner) |
| Owner distribution | OWNER_DEPOSITS / OWNER_EQUITY (owner) | CASH |

Every row ships with a golden test asserting the entry balances and the resulting derived balances are correct.
