import { getLedger, getTenant } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/money";
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
  EmptyState,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { orgId, legalEntityId } = await getTenant();
  const ledger = await getLedger();

  const [cash, ar, ap, pursePayable, income, expense, horses, owners, entries] = await Promise.all([
    ledger.balanceOf("CASH"),
    ledger.balanceOf("ACCOUNTS_RECEIVABLE"),
    ledger.balanceOf("ACCOUNTS_PAYABLE"),
    ledger.balanceOf("OWNER_PURSE_PAYABLE"),
    ledger.balanceOf("OPERATING_INCOME"),
    ledger.balanceOf("OPERATING_EXPENSE"),
    prisma.horse.count({ where: { orgId } }),
    prisma.party.count({ where: { orgId, type: { in: ["INDIVIDUAL", "SYNDICATE"] } } }),
    prisma.journalEntry.findMany({
      where: { orgId, legalEntityId },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { lines: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">
            {horses} horses · {owners} owners & syndicates
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Cash" value={fmt(cash)} tone="brand" />
        <StatTile label="Receivable" value={fmt(ar)} hint="Owed to the barn" />
        <StatTile label="Payable" value={fmt(ap)} hint="Owed to vendors" />
        <StatTile label="Purse payable" value={fmt(pursePayable)} hint="Owed to partners" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title="Recent Ledger Activity" subtitle="Immutable journal entries, most recent first" />
            {entries.length === 0 ? (
              <EmptyState title="No Entries Yet" hint="Post a vendor bill or record a purse to see activity." />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Date</TH>
                    <TH>Memo</TH>
                    <TH>Lines</TH>
                    <TH right>Amount</TH>
                  </tr>
                </THead>
                <tbody>
                  {entries.map((e) => {
                    const debits = e.lines.reduce((a, l) => a + l.debit, 0n);
                    return (
                      <TR key={e.id}>
                        <TD>{e.date.toISOString().slice(0, 10)}</TD>
                        <TD>
                          {e.memo ?? "—"}
                          {e.reversalOf ? <Badge tone="negative">reversal</Badge> : null}
                        </TD>
                        <TD>{e.lines.length}</TD>
                        <TD right mono>
                          {fmt(debits)}
                        </TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Period P&L" subtitle="Derived from the ledger" />
          <div className="space-y-3 p-5">
            <Row label="Income" value={fmt(income)} tone="positive" />
            <Row label="Expense" value={fmt(expense)} tone="negative" />
            <div className="border-t border-border pt-3">
              <Row label="Net" value={fmt((income - expense) as bigint)} strong />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
  strong?: boolean;
}) {
  const color = tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-fg";
  return (
    <div className="flex items-center justify-between">
      <span className={"text-sm " + (strong ? "font-semibold text-fg" : "text-muted")}>{label}</span>
      <span className={"tabnum text-sm " + (strong ? "font-semibold text-fg" : color)}>{value}</span>
    </div>
  );
}
