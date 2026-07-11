import { getTenant } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { partyNames, horseNames } from "@/lib/queries";
import { fmt } from "@/lib/money";
import {
  Card,
  CardHeader,
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

export default async function PursesPage() {
  const { orgId, legalEntityId } = await getTenant();
  const [purses, parties, horses] = await Promise.all([
    prisma.purse.findMany({
      where: { orgId, legalEntityId },
      orderBy: { resultDate: "desc" },
      include: { allocations: true },
    }),
    partyNames(orgId),
    horseNames(orgId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Purses</h1>
          <p className="mt-1 text-sm text-muted">
            Recorded purses, disbursed to every partner — including nested syndicate members
          </p>
        </div>
        <LinkButton href="/purses/new">+ Record purse</LinkButton>
      </div>

      {purses.length === 0 ? (
        <Card>
          <EmptyState
            title="No purses recorded yet"
            hint="Record one to split owner-net across partners, penny-exact."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {purses.map((p) => (
            <Card key={p.id}>
              <CardHeader
                title={`${horses.get(p.horseId) ?? p.horseId} — ${p.resultDate.toISOString().slice(0, 10)}`}
                subtitle={`Owner-net ${fmt(p.netToOwnerCents)} · gross ${fmt(p.grossCents)}`}
                action={<Badge tone="gold">disbursed</Badge>}
              />
              <Table>
                <THead>
                  <tr>
                    <TH>Partner</TH>
                    <TH right>Allocation</TH>
                  </tr>
                </THead>
                <tbody>
                  {p.allocations.map((a) => (
                    <TR key={a.id}>
                      <TD>{parties.get(a.partyId) ?? a.partyId}</TD>
                      <TD right mono>
                        {fmt(a.amountCents)}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
