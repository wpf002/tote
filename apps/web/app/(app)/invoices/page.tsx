import Link from "next/link";
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
  EmptyState,
} from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Owner statements derived straight from the ledger's AR balances. An owner's
 * outstanding balance is the sum of their receivable lines — no separately
 * stored total to drift (invariant #2).
 */
export default async function InvoicesPage() {
  const { orgId } = await getTenant();
  const ledger = await getLedger();

  const owners = await prisma.party.findMany({
    where: { orgId, type: { in: ["INDIVIDUAL", "SYNDICATE"] } },
    orderBy: { name: "asc" },
  });

  const rows = (
    await Promise.all(
      owners.map(async (o) => ({
        party: o,
        receivable: await ledger.balanceOf("ACCOUNTS_RECEIVABLE", { partyId: o.id }),
      })),
    )
  ).filter((r) => r.receivable !== 0n);

  const total = rows.reduce((a, r) => a + (r.receivable as bigint), 0n);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invoices & Statements</h1>
        <p className="mt-1 text-sm text-muted">Outstanding owner balances, derived from the ledger</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Total outstanding" value={fmt(total)} tone="brand" />
        <StatTile label="Owners billed" value={String(rows.length)} />
      </div>

      <Card>
        <CardHeader title="Owner statements" subtitle="Click through for line-item detail" />
        {rows.length === 0 ? (
          <EmptyState title="Nothing outstanding" hint="All owner balances are settled." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Owner</TH>
                <TH right>Outstanding</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map(({ party, receivable }) => (
                <TR key={party.id}>
                  <TD>
                    <Link href={`/owners/${party.id}`} className="font-medium text-fg hover:text-brand">
                      {party.name}
                    </Link>
                  </TD>
                  <TD right mono>
                    {fmt(receivable)}
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
