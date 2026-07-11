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
  core/            @tote/core — the financial spine
    src/money/     Cents, toCents, format, splitCents, arithmetic helpers
    src/ownership/ effective-dated ownership resolver (recurses syndicate membership)
    src/ledger/    posting engine: postEntry / balanceOf / reverseEntry / netPosition
    test/          unit + fast-check property tests for every invariant
```

## Status — Phase 0 (Foundation)

Done and green:

- Money layer: `Cents` (branded bigint), `toCents`, `format`, `splitCents`
  (largest-remainder), arithmetic + `applyBps`.
- Ownership resolver: horse + date → effective leaf-party stakes, recursively
  resolving nested syndicates, with cycle detection and effective dating.
- Posting engine (`Ledger`) over a `LedgerStore` interface, with an append-only
  in-memory store. Validates balancing, derives dimensional balances, reverses
  entries, computes net position, all bound to a single tenant.

Property tests cover: `splitCents` always sums to the total; ownership splits of
random nested trees stay penny-exact; any posting sequence's derived balance
matches the hand-summed expected; reversals restore balances; no query crosses a
tenant boundary.

Next: Postgres-backed `LedgerStore` (Prisma), the 40-model domain schema and
initial migration, auth/sessions, and multi-tenancy middleware.

## Develop

```bash
pnpm install
pnpm -r typecheck
pnpm -r test        # unit + property tests
```

Requires Node >= 18 and pnpm 9.
