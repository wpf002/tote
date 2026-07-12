import { getLedger, getTenant } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { loadOwnershipGraph } from "@/lib/ownership";
import { resolveEffectiveOwnership } from "@tote/core";
import { fmt, fmtBps } from "@/lib/money";
import { payInvoiceOnline } from "./actions";
import {
  Card,
  CardHeader,
  StatTile,
  Table,
  THead,
  TH,
  TR,
  TD,
  Button,
  Badge,
  EmptyState,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const { orgId, user } = await getTenant();

  if (!user.partyId) {
    return (
      <Card>
        <EmptyState
          title="No Linked Owner Account"
          hint="This login isn't associated with an ownership party."
        />
      </Card>
    );
  }

  const partyId = user.partyId;
  const ledger = await getLedger();
  const [party, receivable, pursePayable, net, graph, horses, lines, invoices] = await Promise.all([
    prisma.party.findFirst({ where: { id: partyId, orgId } }),
    ledger.balanceOf("ACCOUNTS_RECEIVABLE", { partyId }),
    ledger.balanceOf("OWNER_PURSE_PAYABLE", { partyId }),
    ledger.netPosition(partyId),
    loadOwnershipGraph(orgId),
    prisma.horse.findMany({ where: { orgId }, orderBy: { name: "asc" } }),
    prisma.journalLine.findMany({
      where: { orgId, partyId },
      include: { entry: true },
      orderBy: { entry: { date: "desc" } },
      take: 30,
    }),
    prisma.invoice.findMany({
      where: { orgId, ownerPartyId: partyId, status: "FINALIZED" },
      include: { lines: true, paymentApplications: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const outstandingInvoices = invoices
    .map((inv) => {
      const total = inv.lines.reduce((a, l) => a + l.amountCents, 0n);
      const paid = inv.paymentApplications.reduce((a, p) => a + p.amountCents, 0n);
      return { inv, outstanding: total - paid };
    })
    .filter((x) => x.outstanding > 0n);

  const now = new Date();
  const myHorses = horses
    .map((h) => {
      try {
        const share = resolveEffectiveOwnership(graph, h.id, now).find((s) => s.partyId === partyId);
        return share ? { name: h.name, bps: share.basisPoints } : null;
      } catch {
        return null;
      }
    })
    .filter((x): x is { name: string; bps: number } => x !== null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {party?.name}</h1>
        <p className="mt-1 text-sm text-muted">Your statement and holdings</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatTile label="You owe" value={fmt(receivable)} tone={receivable > 0n ? "negative" : "default"} />
        <StatTile label="Purse due to you" value={fmt(pursePayable)} tone="positive" />
        <StatTile
          label="Net position"
          value={fmt(net)}
          tone={net > 0n ? "positive" : net < 0n ? "negative" : "default"}
        />
      </div>

      {outstandingInvoices.length > 0 ? (
        <Card>
          <CardHeader title="Pay Online" subtitle="Card or ACH — funds settle straight to the barn" />
          <Table>
            <THead>
              <tr>
                <TH>Invoice</TH>
                <TH right>Outstanding</TH>
                <TH right>Pay</TH>
              </tr>
            </THead>
            <tbody>
              {outstandingInvoices.map(({ inv, outstanding }) => (
                <TR key={inv.id}>
                  <TD>
                    {inv.runKey ?? inv.periodStart.toISOString().slice(0, 7)}{" "}
                    <Badge>{inv.lines.length} lines</Badge>
                  </TD>
                  <TD right mono>
                    {fmt(outstanding)}
                  </TD>
                  <TD right>
                    <form action={payInvoiceOnline} className="flex justify-end">
                      <input type="hidden" name="invoiceId" value={inv.id} />
                      <Button type="submit">Pay {fmt(outstanding)}</Button>
                    </form>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Your Horses" />
        {myHorses.length === 0 ? (
          <EmptyState title="No Current Holdings" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Horse</TH>
                <TH right>Your share</TH>
              </tr>
            </THead>
            <tbody>
              {myHorses.map((h) => (
                <TR key={h.name}>
                  <TD>{h.name}</TD>
                  <TD right mono>
                    {fmtBps(h.bps)}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Statement" subtitle="Charges and credits on your account" />
        {lines.length === 0 ? (
          <EmptyState title="No Activity Yet" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Description</TH>
                <TH right>Charge</TH>
                <TH right>Credit</TH>
              </tr>
            </THead>
            <tbody>
              {lines.map((l) => {
                const charge = l.accountKind === "ACCOUNTS_RECEIVABLE" ? l.debit : 0n;
                const credit =
                  l.accountKind === "ACCOUNTS_RECEIVABLE"
                    ? l.credit
                    : l.accountKind === "OWNER_PURSE_PAYABLE"
                      ? l.credit
                      : 0n;
                return (
                  <TR key={l.id}>
                    <TD>{l.entry.date.toISOString().slice(0, 10)}</TD>
                    <TD>{l.entry.memo ?? "—"}</TD>
                    <TD right mono>
                      {charge > 0n ? fmt(charge) : ""}
                    </TD>
                    <TD right mono>
                      {credit > 0n ? fmt(credit) : ""}
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
