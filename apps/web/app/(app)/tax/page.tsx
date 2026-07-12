import { getTenant } from "@/lib/tenant";
import { getServiceContext } from "@/lib/services";
import { prisma } from "@/lib/db";
import { generate1099 } from "@tote/services";
import { fmt } from "@/lib/money";
import { purchaseHorse, sellHorse } from "./actions";
import {
  Card,
  CardHeader,
  Table,
  THead,
  TH,
  TR,
  TD,
  Field,
  Button,
  Badge,
  EmptyState,
  inputClass,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TaxPage({ searchParams }: { searchParams: { year?: string } }) {
  const { orgId } = await getTenant();
  const ctx = await getServiceContext();
  const year = /^\d{4}$/.test(searchParams.year ?? "") ? Number(searchParams.year) : new Date().getUTCFullYear();

  const [forms, horses, transactions] = await Promise.all([
    generate1099(ctx, year),
    prisma.horse.findMany({ where: { orgId }, orderBy: { name: "asc" } }),
    prisma.horseTransaction.findMany({
      where: { orgId },
      orderBy: { date: "desc" },
      take: 10,
    }),
  ]);
  const horseName = new Map(horses.map((h) => [h.id, h.name]));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tax & Assets</h1>
        <p className="mt-1 text-sm text-muted">Horse basis, gain/loss on sale, and 1099s</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Buy a Horse" subtitle="Capitalizes the cost basis" />
          <form action={purchaseHorse} className="space-y-3 p-5">
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
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cost (USD)">
                <input name="cost" inputMode="decimal" className={inputClass} placeholder="50000" />
              </Field>
              <Field label="Date">
                <input name="date" type="date" defaultValue={today} className={inputClass} />
              </Field>
            </div>
            <Button type="submit">Record Purchase</Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Sell a Horse" subtitle="Computes and posts gain or loss vs. basis" />
          <form action={sellHorse} className="space-y-3 p-5">
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
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sale price (USD)">
                <input name="sale" inputMode="decimal" className={inputClass} placeholder="80000" />
              </Field>
              <Field label="Date">
                <input name="date" type="date" defaultValue={today} className={inputClass} />
              </Field>
            </div>
            <Button type="submit">Record Sale</Button>
          </form>
        </Card>
      </div>

      {transactions.length > 0 ? (
        <Card>
          <CardHeader title="Horse Transactions" />
          <Table>
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Horse</TH>
                <TH>Type</TH>
                <TH right>Amount</TH>
                <TH right>Basis</TH>
                <TH right>Gain/Loss</TH>
              </tr>
            </THead>
            <tbody>
              {transactions.map((t) => {
                const gain = t.kind === "SALE" && t.basisCents !== null ? t.amountCents - t.basisCents : null;
                return (
                  <TR key={t.id}>
                    <TD>{t.date.toISOString().slice(0, 10)}</TD>
                    <TD>{horseName.get(t.horseId) ?? t.horseId}</TD>
                    <TD>
                      <Badge tone={t.kind === "SALE" ? "gold" : "brand"}>{t.kind}</Badge>
                    </TD>
                    <TD right mono>{fmt(t.amountCents)}</TD>
                    <TD right mono>{t.basisCents !== null ? fmt(t.basisCents) : ""}</TD>
                    <TD right mono>
                      {gain !== null ? (
                        <span className={gain >= 0n ? "text-positive" : "text-negative"}>{fmt(gain)}</span>
                      ) : (
                        ""
                      )}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title={`1099-NEC · ${year}`}
          subtitle="Contractors paid $600+ this year"
          action={
            <form method="GET">
              <input
                name="year"
                defaultValue={String(year)}
                className="w-24 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-fg outline-none focus:border-brand"
              />
            </form>
          }
        />
        {forms.length === 0 ? (
          <EmptyState title="No 1099s for This Year" hint="No contractor crossed the $600 threshold." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Contractor</TH>
                <TH right>Amount paid</TH>
              </tr>
            </THead>
            <tbody>
              {forms.map((f) => (
                <TR key={f.vendorPartyId}>
                  <TD>{f.name}</TD>
                  <TD right mono>{fmt(f.amountCents)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
