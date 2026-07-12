import Link from "next/link";
import { notFound } from "next/navigation";
import { getLedger, getTenant } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { loadOwnershipGraph } from "@/lib/ownership";
import { partyNames } from "@/lib/queries";
import { resolveEffectiveOwnership, directOwners } from "@tote/core";
import { fmt, fmtBps } from "@/lib/money";
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

export default async function HorseDetail({ params }: { params: { id: string } }) {
  const { orgId, legalEntityId } = await getTenant();
  const now = new Date();

  const horse = await prisma.horse.findFirst({
    where: { id: params.id, orgId },
    include: { trainingRates: { orderBy: { from: "desc" } } },
  });
  if (!horse) notFound();

  const ledger = await getLedger();
  const [graph, names, expense, income, lines] = await Promise.all([
    loadOwnershipGraph(orgId),
    partyNames(orgId),
    ledger.balanceOf("OPERATING_EXPENSE", { horseId: horse.id }),
    ledger.balanceOf("OPERATING_INCOME", { horseId: horse.id }),
    prisma.journalLine.findMany({
      where: { orgId, legalEntityId, horseId: horse.id },
      include: { entry: true },
      orderBy: { entry: { date: "desc" } },
      take: 15,
    }),
  ]);

  const direct = directOwners(graph, horse.id, now);
  let leaves: Array<{ partyId: string; basisPoints: number }> = [];
  try {
    leaves = resolveEffectiveOwnership(graph, horse.id, now);
  } catch {
    leaves = [];
  }
  const hasSyndicate = direct.some((d) => graph.isSyndicate(d.partyId));
  const rate = horse.trainingRates[0]?.dailyRateCents ?? 0n;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-sm text-muted">
        <Link href="/horses" className="hover:text-fg">
          Horses
        </Link>
        <span>/</span>
        <span className="text-fg">{horse.name}</span>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{horse.name}</h1>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatTile label="Daily training rate" value={`${fmt(rate)}/day`} tone="brand" />
        <StatTile label="Expense (horse)" value={fmt(expense)} tone="negative" />
        <StatTile label="Income (horse)" value={fmt(income)} tone="positive" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Ownership"
            subtitle={hasSyndicate ? "Direct owners of record" : "Owners of record"}
          />
          <Table>
            <THead>
              <tr>
                <TH>Party</TH>
                <TH right>Share</TH>
              </tr>
            </THead>
            <tbody>
              {direct.map((o) => (
                <TR key={o.partyId}>
                  <TD>
                    {names.get(o.partyId) ?? o.partyId}
                    {graph.isSyndicate(o.partyId) ? <Badge tone="gold">syndicate</Badge> : null}
                  </TD>
                  <TD right mono>
                    {fmtBps(o.basisPoints)}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>

        {hasSyndicate ? (
          <Card>
            <CardHeader
              title="Effective Ownership"
              subtitle="Resolved through syndicate membership to leaf partners"
            />
            <Table>
              <THead>
                <tr>
                  <TH>Partner</TH>
                  <TH right>Effective share</TH>
                </tr>
              </THead>
              <tbody>
                {leaves.map((o) => (
                  <TR key={o.partyId}>
                    <TD>{names.get(o.partyId) ?? o.partyId}</TD>
                    <TD right mono>
                      {fmtBps(o.basisPoints)}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </Card>
        ) : null}
      </div>

      <Card>
        <CardHeader title="Ledger Activity" subtitle="Every line tagged to this horse" />
        {lines.length === 0 ? (
          <EmptyState title="No Activity for This Horse Yet" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Memo</TH>
                <TH>Account</TH>
                <TH right>Debit</TH>
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
