import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { loadOwnershipGraph } from "@/lib/ownership";
import { partyNames } from "@/lib/queries";
import { resolveEffectiveOwnership } from "@tote/core";
import { fmt, fmtBps } from "@/lib/money";
import { Card, Table, THead, TH, TR, TD, Badge, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HorsesPage() {
  const { orgId } = await getTenant();
  const now = new Date();

  const [horses, graph, names] = await Promise.all([
    prisma.horse.findMany({
      where: { orgId },
      orderBy: { name: "asc" },
      include: { trainingRates: { orderBy: { from: "desc" }, take: 1 } },
    }),
    loadOwnershipGraph(orgId),
    partyNames(orgId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Horses</h1>
        <p className="mt-1 text-sm text-muted">{horses.length} in training</p>
      </div>

      <Card>
        {horses.length === 0 ? (
          <EmptyState title="No horses yet" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Horse</TH>
                <TH>Effective owners (today)</TH>
                <TH right>Daily rate</TH>
              </tr>
            </THead>
            <tbody>
              {horses.map((h) => {
                let owners: Array<{ partyId: string; basisPoints: number }> = [];
                try {
                  owners = resolveEffectiveOwnership(graph, h.id, now);
                } catch {
                  owners = [];
                }
                const rate = h.trainingRates[0]?.dailyRateCents ?? 0n;
                return (
                  <TR key={h.id}>
                    <TD>
                      <Link href={`/horses/${h.id}`} className="font-medium text-fg hover:text-brand">
                        {h.name}
                      </Link>
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1.5">
                        {owners.map((o) => (
                          <Badge key={o.partyId} tone="brand">
                            {names.get(o.partyId) ?? o.partyId} · {fmtBps(o.basisPoints)}
                          </Badge>
                        ))}
                      </div>
                    </TD>
                    <TD right mono>
                      {fmt(rate)}/day
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
