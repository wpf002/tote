import { getServiceContext } from "@/lib/services";
import { auditLedger } from "@tote/services";
import { fmt } from "@/lib/money";
import { Card, CardHeader, StatTile, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const ctx = await getServiceContext();
  const report = await auditLedger(ctx);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ledger Audit</h1>
          <p className="mt-1 text-sm text-muted">Continuous proof that the books are internally consistent</p>
        </div>
        <Badge tone={report.healthy ? "positive" : "negative"}>
          {report.healthy ? "Books balance" : "Attention needed"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Journal entries" value={String(report.entryCount)} />
        <StatTile label="Ledger lines" value={String(report.lineCount)} />
        <StatTile label="Total debits" value={fmt(report.totalDebits)} />
        <StatTile
          label="Total credits"
          value={fmt(report.totalCredits)}
          tone={report.totalDebits === report.totalCredits ? "positive" : "negative"}
        />
      </div>

      <Card>
        <CardHeader title="Integrity checks" subtitle="Recomputed from the raw ledger on every load" />
        <ul className="divide-y divide-border/60">
          {report.checks.map((c) => (
            <li key={c.name} className="flex items-start gap-3 px-5 py-4">
              <span
                className={
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold " +
                  (c.ok ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative")
                }
              >
                {c.ok ? "✓" : "✕"}
              </span>
              <div>
                <div className="text-sm font-medium text-fg">{c.name}</div>
                <div className="mt-0.5 text-sm text-muted">{c.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <p className="text-center text-xs text-muted">
        This isn&apos;t a stored status — it&apos;s recomputed from every ledger line each time you open the page. If a
        single entry were ever off by a penny, it would show here.
      </p>
    </div>
  );
}
