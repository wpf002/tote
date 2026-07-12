import { getServiceContext } from "@/lib/services";
import { monthPeriod, trialBalance } from "@tote/services";
import { fmt } from "@/lib/money";
import {
  Card,
  CardHeader,
  Table,
  THead,
  TH,
  TR,
  TD,
  EmptyState,
  LinkButton,
  inputClass,
} from "@/components/ui";

export const dynamic = "force-dynamic";

function defaultMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function ExportsPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? "") ? searchParams.month! : defaultMonth();
  const [y, m] = month.split("-").map(Number);

  const ctx = await getServiceContext();
  const rows = await trialBalance(ctx, monthPeriod(y!, m!));
  const debit = rows.reduce((a, r) => a + r.debit, 0n);
  const credit = rows.reduce((a, r) => a + r.credit, 0n);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Exports</h1>
        <p className="mt-1 text-sm text-muted">Hand your CPA a clean QuickBooks general journal</p>
      </div>

      <Card>
        <CardHeader
          title="QuickBooks General Journal"
          subtitle={`Trial balance for ${month} — debits and credits tie out`}
          action={<LinkButton href={`/exports/quickbooks?month=${month}`}>Download CSV</LinkButton>}
        />
        <form method="GET" className="flex items-end gap-2 px-5 pt-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Period</span>
            <input type="month" name="month" defaultValue={month} className={inputClass} />
          </label>
          <button className="rounded-lg bg-surface-2 px-3.5 py-2 text-sm font-medium text-fg hover:bg-border">
            View
          </button>
        </form>
        {rows.length === 0 ? (
          <EmptyState title="No Activity in This Period" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Account</TH>
                <TH right>Debit</TH>
                <TH right>Credit</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.account}>
                  <TD>{r.account}</TD>
                  <TD right mono>
                    {r.debit > 0n ? fmt(r.debit) : ""}
                  </TD>
                  <TD right mono>
                    {r.credit > 0n ? fmt(r.credit) : ""}
                  </TD>
                </TR>
              ))}
              <TR>
                <TD>
                  <span className="font-semibold">Total</span>
                </TD>
                <TD right mono>
                  <span className="font-semibold">{fmt(debit)}</span>
                </TD>
                <TD right mono>
                  <span className="font-semibold">{fmt(credit)}</span>
                </TD>
              </TR>
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
