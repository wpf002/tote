import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { createVendorBill } from "../actions";
import { Card, CardHeader, Field, Button, LinkButton, inputClass } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NewVendorBill() {
  const { orgId } = await getTenant();
  const [vendors, horses, categories] = await Promise.all([
    prisma.party.findMany({ where: { orgId, type: "VENDOR" }, orderBy: { name: "asc" } }),
    prisma.horse.findMany({ where: { orgId }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ where: { orgId }, orderBy: { name: "asc" } }),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex items-center gap-3 text-sm text-muted">
        <Link href="/vendor-bills" className="hover:text-fg">
          Vendor Bills
        </Link>
        <span>/</span>
        <span className="text-fg">New</span>
      </div>

      <Card>
        <CardHeader title="New vendor bill" subtitle="Posts Dr Operating Expense / Cr Accounts Payable" />
        <form action={createVendorBill} className="space-y-4 p-5">
          <Field label="Vendor">
            <select name="vendorPartyId" required className={inputClass} defaultValue="">
              <option value="" disabled>
                Select a vendor…
              </option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Horse (optional)">
              <select name="horseId" className={inputClass} defaultValue="">
                <option value="">— none —</option>
                {horses.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Category (optional)">
              <select name="categoryId" className={inputClass} defaultValue="">
                <option value="">— none —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Description">
            <input name="description" className={inputClass} placeholder="e.g. Lameness exam" />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount (USD)">
              <input name="amount" inputMode="decimal" required className={inputClass} placeholder="450.00" />
            </Field>
            <Field label="Bill date">
              <input name="billDate" type="date" defaultValue={today} className={inputClass} />
            </Field>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit">Approve & post</Button>
            <LinkButton href="/vendor-bills" variant="ghost">
              Cancel
            </LinkButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
