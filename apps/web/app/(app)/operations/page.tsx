import { getTenant } from "@/lib/tenant";
import { getServiceContext } from "@/lib/services";
import { prisma } from "@/lib/db";
import { apAging } from "@tote/services";
import { partyNames } from "@/lib/queries";
import { fmt } from "@/lib/money";
import { runPayrollAction, recordShipmentAction, recordInsuranceAction } from "./actions";
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
  EmptyState,
  inputClass,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const { orgId } = await getTenant();
  const ctx = await getServiceContext();

  const [aging, employees, horses, names] = await Promise.all([
    apAging(ctx, new Date()),
    prisma.employee.findMany({ where: { orgId } }),
    prisma.horse.findMany({ where: { orgId }, orderBy: { name: "asc" } }),
    partyNames(orgId),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Operations</h1>
        <p className="mt-1 text-sm text-muted">Payroll, AP aging, transportation, insurance</p>
      </div>

      <Card>
        <CardHeader title="Accounts payable aging" subtitle="Outstanding vendor balances by age" />
        {aging.length === 0 ? (
          <EmptyState title="No outstanding payables" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Vendor</TH>
                <TH right>Current</TH>
                <TH right>31–60</TH>
                <TH right>61–90</TH>
                <TH right>90+</TH>
                <TH right>Total</TH>
              </tr>
            </THead>
            <tbody>
              {aging.map((r) => (
                <TR key={r.vendorPartyId}>
                  <TD>{names.get(r.vendorPartyId) ?? r.vendorPartyId}</TD>
                  <TD right mono>{r.current > 0n ? fmt(r.current) : ""}</TD>
                  <TD right mono>{r.d30 > 0n ? fmt(r.d30) : ""}</TD>
                  <TD right mono>{r.d60 > 0n ? fmt(r.d60) : ""}</TD>
                  <TD right mono>{r.d90plus > 0n ? fmt(r.d90plus) : ""}</TD>
                  <TD right mono>{fmt(r.total)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Run payroll" subtitle="Posts Dr Labor / Cr Wages Payable" />
          <form action={runPayrollAction} className="space-y-3 p-5">
            {employees.length === 0 ? (
              <p className="text-sm text-muted">No employees.</p>
            ) : (
              employees.map((e) => (
                <Field key={e.id} label={names.get(e.partyId) ?? e.partyId}>
                  <input name={`gross_${e.id}`} inputMode="decimal" placeholder="0.00" className={inputClass} />
                </Field>
              ))
            )}
            <Button type="submit">Run payroll</Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Record shipment" subtitle="Cost split evenly per horse" />
          <form action={recordShipmentAction} className="space-y-3 p-5">
            <div className="grid grid-cols-2 gap-2">
              <input name="fromLoc" placeholder="From" className={inputClass} />
              <input name="toLoc" placeholder="To" className={inputClass} />
            </div>
            <input name="total" inputMode="decimal" placeholder="Total cost" className={inputClass} />
            <input name="shipDate" type="date" defaultValue={today} className={inputClass} />
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted">Horses</span>
              {horses.map((h) => (
                <label key={h.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="horseIds" value={h.id} /> {h.name}
                </label>
              ))}
            </div>
            <Button type="submit">Record shipment</Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Insurance policy" subtitle="Premium expense + renewal reminder" />
          <form action={recordInsuranceAction} className="space-y-3 p-5">
            <input name="carrier" placeholder="Carrier" className={inputClass} />
            <input name="premium" inputMode="decimal" placeholder="Premium" className={inputClass} />
            <select name="horseId" className={inputClass} defaultValue="">
              <option value="">— barn-wide —</option>
              {horses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input name="startDate" type="date" defaultValue={today} className={inputClass} />
              <input name="endDate" type="date" className={inputClass} />
            </div>
            <Button type="submit">Add policy</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
