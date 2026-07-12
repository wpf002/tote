import { getTenant } from "@/lib/tenant";
import { getServiceContext } from "@/lib/services";
import { prisma } from "@/lib/db";
import { upcomingStakesDeadlines } from "@tote/services";
import { horseNames } from "@/lib/queries";
import { fmt } from "@/lib/money";
import { addStakesSchedule, payStakes, recordResult } from "./actions";
import {
  Card,
  CardHeader,
  Table,
  THead,
  TH,
  TR,
  TD,
  Badge,
  Button,
  Field,
  EmptyState,
  inputClass,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function RacingPage() {
  const { orgId } = await getTenant();
  const ctx = await getServiceContext();
  const horizon = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);

  const [deadlines, schedules, horses, jockeys, names] = await Promise.all([
    upcomingStakesDeadlines(ctx, horizon),
    prisma.stakesSchedule.findMany({
      where: { orgId },
      include: { payments: { orderBy: { dueDate: "asc" } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.horse.findMany({ where: { orgId }, orderBy: { name: "asc" } }),
    prisma.party.findMany({ where: { orgId, type: "JOCKEY" }, orderBy: { name: "asc" } }),
    horseNames(orgId),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Racing</h1>
        <p className="mt-1 text-sm text-muted">Stakes deadlines and race-result purses</p>
      </div>

      <Card>
        <CardHeader title="Upcoming stakes deadlines" subtitle="Fire before these dates or forfeit eligibility" />
        {deadlines.length === 0 ? (
          <EmptyState title="No upcoming deadlines" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Due</TH>
                <TH>Payment</TH>
                <TH right>Action</TH>
              </tr>
            </THead>
            <tbody>
              {deadlines.map((d) => {
                const overdue = d.dueDate.getTime() < Date.now();
                return (
                  <TR key={d.id}>
                    <TD>
                      {d.dueDate.toISOString().slice(0, 10)}{" "}
                      {overdue ? <Badge tone="negative">overdue</Badge> : <Badge tone="brand">upcoming</Badge>}
                    </TD>
                    <TD>{d.message}</TD>
                    <TD right>
                      <form action={payStakes} className="flex justify-end">
                        <input type="hidden" name="paymentId" value={d.paymentId} />
                        <Button type="submit" variant="ghost">
                          Mark paid
                        </Button>
                      </form>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="New stakes schedule" subtitle="Nomination + keep-in ladder" />
          <form action={addStakesSchedule} className="space-y-4 p-5">
            <Field label="Horse">
              <select name="horseId" required className={inputClass} defaultValue="">
                <option value="" disabled>
                  Select…
                </option>
                {horses.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Race name">
              <input name="raceName" className={inputClass} placeholder="Spring Derby" />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <input name="label_1" defaultValue="Nomination" className={inputClass} />
              <input name="due_1" type="date" className={inputClass} />
              <input name="amount_1" placeholder="600" className={inputClass} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input name="label_2" defaultValue="Keep-in" className={inputClass} />
              <input name="due_2" type="date" className={inputClass} />
              <input name="amount_2" placeholder="1500" className={inputClass} />
            </div>
            <Button type="submit">Create schedule</Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Record race result" subtitle="Jockey + trainer cut deducted, rest to owners" />
          <form action={recordResult} className="space-y-4 p-5">
            <Field label="Horse">
              <select name="horseId" required className={inputClass} defaultValue="">
                <option value="" disabled>
                  Select…
                </option>
                {horses.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Gross purse (USD)">
                <input name="gross" inputMode="decimal" className={inputClass} placeholder="50000" />
              </Field>
              <Field label="Trainer cut (USD)">
                <input name="trainerCut" inputMode="decimal" className={inputClass} placeholder="2000" />
              </Field>
            </div>
            <Field label="Jockey">
              <select name="jockeyPartyId" className={inputClass} defaultValue="">
                <option value="">— none —</option>
                {jockeys.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Mount fee (USD)">
                <input name="mountFee" inputMode="decimal" className={inputClass} placeholder="500" />
              </Field>
              <Field label="Win %">
                <input name="winPct" inputMode="decimal" className={inputClass} placeholder="10" />
              </Field>
            </div>
            <input name="resultDate" type="date" defaultValue={today} className={inputClass} />
            <Button type="submit">Record & disburse</Button>
          </form>
        </Card>
      </div>

      {schedules.length > 0 ? (
        <Card>
          <CardHeader title="Stakes schedules" />
          <Table>
            <THead>
              <tr>
                <TH>Horse</TH>
                <TH>Race</TH>
                <TH>Payment</TH>
                <TH>Due</TH>
                <TH>Status</TH>
                <TH right>Amount</TH>
              </tr>
            </THead>
            <tbody>
              {schedules.flatMap((s) =>
                s.payments.map((p) => (
                  <TR key={p.id}>
                    <TD>{names.get(s.horseId) ?? s.horseId}</TD>
                    <TD>{s.raceName}</TD>
                    <TD>{p.label}</TD>
                    <TD>{p.dueDate.toISOString().slice(0, 10)}</TD>
                    <TD>{p.paid ? <Badge tone="positive">paid</Badge> : <Badge>due</Badge>}</TD>
                    <TD right mono>
                      {fmt(p.amountCents)}
                    </TD>
                  </TR>
                )),
              )}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
