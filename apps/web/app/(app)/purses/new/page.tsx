import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { recordPurse } from "../actions";
import { Card, CardHeader, Field, Button, LinkButton, inputClass } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NewPurse() {
  const { orgId } = await getTenant();
  const horses = await prisma.horse.findMany({ where: { orgId }, orderBy: { name: "asc" } });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex items-center gap-3 text-sm text-muted">
        <Link href="/purses" className="hover:text-fg">
          Purses
        </Link>
        <span>/</span>
        <span className="text-fg">Record</span>
      </div>

      <Card>
        <CardHeader
          title="Record a Purse"
          subtitle="Splits owner-net across owners as of the result date, resolving nested syndicates"
        />
        <form action={recordPurse} className="space-y-4 p-5">
          <Field label="Horse">
            <select name="horseId" required className={inputClass} defaultValue="">
              <option value="" disabled>
                Select a horse…
              </option>
              {horses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Owner net (USD)" hint="Amount to split across owners">
              <input name="ownerNet" inputMode="decimal" required className={inputClass} placeholder="12000.00" />
            </Field>
            <Field label="Trainer cut (USD)" hint="Recorded as purse revenue">
              <input name="trainerCut" inputMode="decimal" className={inputClass} placeholder="1500.00" />
            </Field>
          </div>

          <Field label="Result date">
            <input name="resultDate" type="date" defaultValue={today} className={inputClass} />
          </Field>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit">Record & Disburse</Button>
            <LinkButton href="/purses" variant="ghost">
              Cancel
            </LinkButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
