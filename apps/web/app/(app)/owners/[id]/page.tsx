import Link from "next/link";
import { notFound } from "next/navigation";
import { getLedger, getTenant } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { fmt } from "@/lib/money";
import { applyCredit } from "../actions";
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
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function OwnerDetail({ params }: { params: { id: string } }) {
  const { orgId, legalEntityId } = await getTenant();

  const party = await prisma.party.findFirst({ where: { id: params.id, orgId } });
  if (!party) notFound();

  const ledger = await getLedger();
  const [receivable, pursePayable, net, lines] = await Promise.all([
    ledger.balanceOf("ACCOUNTS_RECEIVABLE", { partyId: party.id }),
    ledger.balanceOf("OWNER_PURSE_PAYABLE", { partyId: party.id }),
    ledger.netPosition(party.id),
    prisma.journalLine.findMany({
      where: { orgId, legalEntityId, partyId: party.id },
      include: { entry: true },
      orderBy: { entry: { date: "desc" } },
      take: 25,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-sm text-muted">
        <Link href="/owners" className="hover:text-fg">
          Owners & Parties
        </Link>
        <span>/</span>
        <span className="text-fg">{party.name}</span>
      </div>

      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{party.name}</h1>
        {party.type === "SYNDICATE" ? <Badge tone="gold">Syndicate</Badge> : <Badge>Individual</Badge>}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatTile label="Receivable" value={fmt(receivable)} hint="Owed to the barn" />
        <StatTile label="Purse payable" value={fmt(pursePayable)} hint="Owed to the partner" />
        <StatTile
          label="Net position"
          value={fmt(net)}
          tone={net > 0n ? "positive" : net < 0n ? "negative" : "default"}
        />
      </div>

      {pursePayable > 0n && receivable > 0n ? (
        <Card>
          <CardHeader
            title="Net purse credit against invoices"
            subtitle={`Apply up to ${fmt(pursePayable < receivable ? pursePayable : receivable)} of purse payable to this owner's outstanding invoices`}
            action={
              <form action={applyCredit}>
                <input type="hidden" name="partyId" value={party.id} />
                <Button type="submit">Apply purse credit</Button>
              </form>
            }
          />
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Statement" subtitle="Every ledger line tagged to this party" />
        {lines.length === 0 ? (
          <EmptyState title="No statement lines yet" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Memo</TH>
                <TH>Account</TH>
                <TH right>Charge</TH>
                <TH right>Credit</TH>
              </tr>
            </THead>
            <tbody>
              {lines.map((l) => (
                <TR key={l.id}>
                  <TD>{l.entry.date.toISOString().slice(0, 10)}</TD>
                  <TD>{l.entry.memo ?? "—"}</TD>
                  <TD>
                    <span className="text-xs text-muted">{l.accountKind}</span>
                  </TD>
                  <TD right mono>
                    {l.debit > 0n ? fmt(l.debit) : ""}
                  </TD>
                  <TD right mono>
                    {l.credit > 0n ? fmt(l.credit) : ""}
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
