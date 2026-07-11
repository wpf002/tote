import Link from "next/link";
import { getLedger, getTenant } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/money";
import { Card, Table, THead, TH, TR, TD, Badge, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function OwnersPage() {
  const { orgId } = await getTenant();
  const ledger = await getLedger();

  const parties = await prisma.party.findMany({
    where: { orgId, type: { in: ["INDIVIDUAL", "SYNDICATE"] } },
    orderBy: { name: "asc" },
  });

  const rows = await Promise.all(
    parties.map(async (p) => ({
      party: p,
      receivable: await ledger.balanceOf("ACCOUNTS_RECEIVABLE", { partyId: p.id }),
      net: await ledger.netPosition(p.id),
    })),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Owners & Parties</h1>
        <p className="mt-1 text-sm text-muted">{parties.length} owners and syndicates</p>
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No owners yet" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Type</TH>
                <TH right>Owes (AR)</TH>
                <TH right>Net position</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map(({ party, receivable, net }) => (
                <TR key={party.id}>
                  <TD>
                    <Link href={`/owners/${party.id}`} className="font-medium text-fg hover:text-brand">
                      {party.name}
                    </Link>
                  </TD>
                  <TD>
                    {party.type === "SYNDICATE" ? (
                      <Badge tone="gold">Syndicate</Badge>
                    ) : (
                      <Badge>Individual</Badge>
                    )}
                  </TD>
                  <TD right mono>
                    {fmt(receivable)}
                  </TD>
                  <TD right mono>
                    <span className={net > 0n ? "text-positive" : net < 0n ? "text-negative" : ""}>
                      {fmt(net)}
                    </span>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="text-xs text-muted">
        Net position = purse payable − receivable. Positive means the barn owes the partner.
      </p>
    </div>
  );
}
