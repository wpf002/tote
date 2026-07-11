import { getTenant } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { partyNames, horseNames } from "@/lib/queries";
import { fmt } from "@/lib/money";
import {
  Card,
  Table,
  THead,
  TH,
  TR,
  TD,
  Badge,
  EmptyState,
  LinkButton,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function VendorBillsPage() {
  const { orgId, legalEntityId } = await getTenant();
  const [bills, parties, horses] = await Promise.all([
    prisma.vendorBill.findMany({
      where: { orgId, legalEntityId },
      orderBy: { billDate: "desc" },
      include: { lines: true },
    }),
    partyNames(orgId),
    horseNames(orgId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vendor Bills</h1>
          <p className="mt-1 text-sm text-muted">Bills against the barn and its horses</p>
        </div>
        <LinkButton href="/vendor-bills/new">+ New bill</LinkButton>
      </div>

      <Card>
        {bills.length === 0 ? (
          <EmptyState title="No vendor bills yet" hint="Create one to post Dr Expense / Cr Payable." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Vendor</TH>
                <TH>Horse</TH>
                <TH>Status</TH>
                <TH right>Amount</TH>
              </tr>
            </THead>
            <tbody>
              {bills.map((b) => {
                const total = b.lines.reduce((a, l) => a + l.amountCents, 0n);
                return (
                  <TR key={b.id}>
                    <TD>{b.billDate.toISOString().slice(0, 10)}</TD>
                    <TD>{parties.get(b.vendorPartyId) ?? b.vendorPartyId}</TD>
                    <TD>{b.horseId ? (horses.get(b.horseId) ?? b.horseId) : "—"}</TD>
                    <TD>
                      <Badge tone={b.status === "PAID" ? "positive" : "brand"}>{b.status}</Badge>
                    </TD>
                    <TD right mono>
                      {fmt(total)}
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
