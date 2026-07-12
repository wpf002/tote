import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { partyNames, horseNames } from "@/lib/queries";
import { fmt } from "@/lib/money";
import { payInvoice } from "../actions";
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
  inputClass,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function InvoiceDetail({ params }: { params: { id: string } }) {
  const { orgId, legalEntityId } = await getTenant();
  const invoice = await prisma.invoice.findFirst({
    where: { id: params.id, orgId, legalEntityId },
    include: { lines: true, paymentApplications: true },
  });
  if (!invoice) notFound();

  const [names, horses] = await Promise.all([partyNames(orgId), horseNames(orgId)]);
  const total = invoice.lines.reduce((s, l) => s + l.amountCents, 0n);
  const paid = invoice.paymentApplications.reduce((s, p) => s + p.amountCents, 0n);
  const outstanding = total - paid;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-sm text-muted">
        <Link href="/invoices" className="hover:text-fg">
          Invoices
        </Link>
        <span>/</span>
        <span className="text-fg">{names.get(invoice.ownerPartyId) ?? invoice.ownerPartyId}</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Invoice · {invoice.runKey ?? invoice.periodStart.toISOString().slice(0, 7)}
          </h1>
          <Badge tone={invoice.status === "PAID" ? "positive" : "brand"}>{invoice.status}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatTile label="Total" value={fmt(total)} />
        <StatTile label="Paid" value={fmt(paid)} tone="positive" />
        <StatTile label="Outstanding" value={fmt(outstanding)} tone={outstanding > 0n ? "brand" : "default"} />
      </div>

      <Card>
        <CardHeader title="Line Items" subtitle={`Owner: ${names.get(invoice.ownerPartyId) ?? invoice.ownerPartyId}`} />
        <Table>
          <THead>
            <tr>
              <TH>Type</TH>
              <TH>Description</TH>
              <TH>Horse</TH>
              <TH right>Cost</TH>
              <TH right>Markup</TH>
              <TH right>Amount</TH>
            </tr>
          </THead>
          <tbody>
            {invoice.lines.map((l) => (
              <TR key={l.id}>
                <TD>
                  <Badge tone={l.kind === "TRAINING" ? "brand" : "gold"}>{l.kind}</Badge>
                </TD>
                <TD>{l.description}</TD>
                <TD>{l.horseId ? (horses.get(l.horseId) ?? l.horseId) : "—"}</TD>
                <TD right mono>
                  {l.recoverCents > 0n ? fmt(l.recoverCents) : ""}
                </TD>
                <TD right mono>
                  {l.markupCents > 0n ? fmt(l.markupCents) : ""}
                </TD>
                <TD right mono>
                  {fmt(l.amountCents)}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>

      {outstanding > 0n ? (
        <Card>
          <CardHeader title="Record Payment" subtitle="Posts Dr Cash / Cr Receivable and applies to this invoice" />
          <form action={payInvoice} className="flex items-end gap-3 p-5">
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Amount (USD)</span>
              <input
                name="amount"
                inputMode="decimal"
                defaultValue={fmt(outstanding).replace("$", "").replace(/,/g, "")}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Method</span>
              <select name="method" className={inputClass} defaultValue="ACH">
                <option>ACH</option>
                <option>CARD</option>
                <option>CHECK</option>
                <option>CASH</option>
              </select>
            </label>
            <Button type="submit">Record Payment</Button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
