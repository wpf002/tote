import { getTenant } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { getServiceContext } from "@/lib/services";
import { proposeReconciliation } from "@tote/services";
import { fmt } from "@/lib/money";
import { importBank, commitAllMatches } from "./actions";
import {
  Card,
  CardHeader,
  StatTile,
  Table,
  THead,
  TH,
  TR,
  TD,
  Badge,
  Button,
  EmptyState,
  inputClass,
} from "@/components/ui";

export const dynamic = "force-dynamic";

const SAMPLE = `Date,Amount,Description
2026-07-05,13500.00,Purse settlement Silk Road
2026-07-02,500.00,Owner ACH Bob Carter
2026-07-08,-45.00,Monthly bank fee`;

export default async function ReconcilePage() {
  const { orgId, legalEntityId } = await getTenant();
  const account = await prisma.bankAccount.findFirst({ where: { orgId, legalEntityId } });

  let matches: Awaited<ReturnType<typeof proposeReconciliation>>["matches"] = [];
  let unmatched: Awaited<ReturnType<typeof proposeReconciliation>>["unmatchedBank"] = [];
  let matchedCount = 0;
  if (account) {
    const ctx = await getServiceContext();
    const proposal = await proposeReconciliation(ctx, account.id, { windowDays: 90 });
    matches = proposal.matches;
    unmatched = proposal.unmatchedBank;
    matchedCount = await prisma.bankTransaction.count({
      where: { bankAccountId: account.id, matchedEntryId: { not: null } },
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bank Reconciliation</h1>
        <p className="mt-1 text-sm text-muted">Match bank lines to immutable ledger cash movements</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatTile label="Reconciled" value={String(matchedCount)} tone="positive" />
        <StatTile label="Proposed matches" value={String(matches.length)} tone="brand" />
        <StatTile label="Unmatched" value={String(unmatched.length)} tone={unmatched.length ? "negative" : "default"} />
      </div>

      <Card>
        <CardHeader title="Import bank transactions" subtitle="Paste a CSV export from your bank" />
        <form action={importBank} className="space-y-3 p-5">
          <textarea
            name="csv"
            defaultValue={SAMPLE}
            rows={5}
            spellCheck={false}
            className={inputClass + " font-mono text-xs"}
          />
          <Button type="submit">Import transactions</Button>
        </form>
      </Card>

      {matches.length > 0 ? (
        <Card>
          <CardHeader
            title="Proposed matches"
            subtitle="Bank line ↔ ledger cash movement, by amount and date"
            action={
              <form action={commitAllMatches}>
                <Button type="submit">Reconcile all</Button>
              </form>
            }
          />
          <Table>
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Description</TH>
                <TH>Ledger entry</TH>
                <TH right>Amount</TH>
              </tr>
            </THead>
            <tbody>
              {matches.map((m) => (
                <TR key={m.bankTransactionId}>
                  <TD>{m.postedAt.toISOString().slice(0, 10)}</TD>
                  <TD>{m.description}</TD>
                  <TD>
                    <span className="text-xs text-muted">{m.entryId.slice(0, 12)}…</span>
                  </TD>
                  <TD right mono>
                    {fmt(m.amountCents)}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Unmatched bank lines" subtitle="No ledger movement found — investigate or post one" />
        {unmatched.length === 0 ? (
          <EmptyState title="Everything ties out" hint="No unmatched bank transactions." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Description</TH>
                <TH right>Amount</TH>
              </tr>
            </THead>
            <tbody>
              {unmatched.map((t) => (
                <TR key={t.id}>
                  <TD>{t.postedAt.toISOString().slice(0, 10)}</TD>
                  <TD>
                    {t.description} <Badge tone="negative">unmatched</Badge>
                  </TD>
                  <TD right mono>
                    {fmt(t.amountCents)}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
