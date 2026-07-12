import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { partyNames } from "@/lib/queries";
import { fmt } from "@/lib/money";
import { runMonth } from "./actions";
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
  Button,
  inputClass,
} from "@/components/ui";

export const dynamic = "force-dynamic";

function defaultMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function InvoicesPage() {
  const { orgId, legalEntityId } = await getTenant();
  const [invoices, names] = await Promise.all([
    prisma.invoice.findMany({
      where: { orgId, legalEntityId },
      orderBy: { createdAt: "desc" },
      include: { lines: true },
    }),
    partyNames(orgId),
  ]);

  const total = invoices.reduce(
    (a, inv) => a + inv.lines.reduce((s, l) => s + l.amountCents, 0n),
    0n,
  );
  const outstanding = invoices
    .filter((i) => i.status !== "PAID" && i.status !== "VOID")
    .reduce((a, inv) => a + inv.lines.reduce((s, l) => s + l.amountCents, 0n), 0n);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
          <p className="mt-1 text-sm text-muted">Owner invoices from the monthly run</p>
        </div>
        <form action={runMonth} className="flex items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Run month</span>
            <input type="month" name="month" defaultValue={defaultMonth()} className={inputClass} />
          </label>
          <Button type="submit">Run Monthly Invoices</Button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Invoices" value={String(invoices.length)} />
        <StatTile label="Billed" value={fmt(total)} />
        <StatTile label="Outstanding" value={fmt(outstanding)} tone="brand" />
      </div>

      <Card>
        <CardHeader title="All Invoices" subtitle="Idempotent per month — re-running never double-bills" />
        {invoices.length === 0 ? (
          <EmptyState
            title="No Invoices Yet"
            hint="Pick a month and run the billing to generate owner invoices."
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Owner</TH>
                <TH>Period</TH>
                <TH>Lines</TH>
                <TH>Status</TH>
                <TH right>Total</TH>
              </tr>
            </THead>
            <tbody>
              {invoices.map((inv) => {
                const invTotal = inv.lines.reduce((s, l) => s + l.amountCents, 0n);
                return (
                  <TR key={inv.id}>
                    <TD>
                      <Link href={`/invoices/${inv.id}`} className="font-medium text-fg hover:text-brand">
                        {names.get(inv.ownerPartyId) ?? inv.ownerPartyId}
                      </Link>
                    </TD>
                    <TD>{inv.runKey ?? inv.periodStart.toISOString().slice(0, 7)}</TD>
                    <TD>{inv.lines.length}</TD>
                    <TD>
                      <Badge tone={inv.status === "PAID" ? "positive" : inv.status === "VOID" ? "negative" : "brand"}>
                        {inv.status}
                      </Badge>
                    </TD>
                    <TD right mono>
                      {fmt(invTotal)}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
