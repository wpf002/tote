import { getTenant } from "@/lib/tenant";
import { getForecast, getHorseRoi } from "@/lib/intelligence";
import { getServiceContext } from "@/lib/services";
import { generateInsights, isConfigured, type Insight } from "@tote/ai";
import { fmt } from "@/lib/money";
import { ReceiptDrafter } from "./receipt-drafter";
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
  EmptyState,
} from "@/components/ui";

export const dynamic = "force-dynamic";

async function loadInsights(): Promise<{ insights: Insight[]; enabled: boolean }> {
  if (!isConfigured()) return { insights: [], enabled: false };
  try {
    const ctx = await getServiceContext();
    return { insights: await generateInsights(ctx), enabled: true };
  } catch {
    return { insights: [], enabled: true };
  }
}

export default async function InsightsPage() {
  const { orgId, legalEntityId } = await getTenant();
  const [forecast, roi, ai] = await Promise.all([
    getForecast(orgId, legalEntityId, 90),
    getHorseRoi(orgId, legalEntityId),
    loadInsights(),
  ]);
  const offline = !forecast && !roi;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
        <p className="mt-1 text-sm text-muted">Receipt drafting, cash-flow forecast, and horse ROI</p>
      </div>

      <Card>
        <CardHeader
          title="AI insights"
          subtitle="What a sharp CFO would flag — grounded in your ledger"
          action={<Badge tone={ai.enabled ? "brand" : "default"}>{ai.enabled ? "Claude Opus 4.8" : "not configured"}</Badge>}
        />
        {!ai.enabled ? (
          <EmptyState
            title="Add an ANTHROPIC_API_KEY to enable AI insights"
            hint="Set it in the web app's environment; the copilot only reads the ledger, never writes it."
          />
        ) : ai.insights.length === 0 ? (
          <EmptyState title="No insights right now" hint="Nothing in the books needs attention." />
        ) : (
          <ul className="divide-y divide-border/60">
            {ai.insights.map((ins, i) => (
              <li key={i} className="flex items-start gap-3 px-5 py-4">
                <Badge tone={ins.severity === "risk" ? "negative" : ins.severity === "watch" ? "gold" : "brand"}>
                  {ins.severity}
                </Badge>
                <div>
                  <div className="text-sm font-medium text-fg">{ins.title}</div>
                  <div className="mt-0.5 text-sm text-muted">{ins.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {offline ? (
        <Card>
          <EmptyState
            title="Intelligence service offline"
            hint="Start it: cd apps/intelligence && uvicorn app.main:app --port 8000"
          />
        </Card>
      ) : null}

      {forecast ? (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted">90-day cash-flow forecast</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Opening cash" value={fmt(BigInt(forecast.summary.opening))} />
            <StatTile
              label="Projected close"
              value={fmt(BigInt(forecast.summary.closing))}
              tone={forecast.summary.closing < 0 ? "negative" : "positive"}
            />
            <StatTile
              label="Low point"
              value={fmt(BigInt(forecast.summary.low))}
              hint={forecast.summary.low_date ?? undefined}
              tone={forecast.summary.low < 0 ? "negative" : "default"}
            />
            <StatTile label="Known costs" value={fmt(BigInt(forecast.summary.total_out))} />
          </div>
        </div>
      ) : null}

      <ReceiptDrafter />

      {roi ? (
        <Card>
          <CardHeader title="Horse ROI" subtitle="Cost vs. earnings — lowest ROI first" />
          {roi.horses.length === 0 ? (
            <EmptyState title="No horse data yet" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Horse</TH>
                  <TH right>Expense</TH>
                  <TH right>Income</TH>
                  <TH right>Net</TH>
                  <TH right>Cost/start</TH>
                  <TH right>ROI</TH>
                </tr>
              </THead>
              <tbody>
                {roi.horses.map((h) => (
                  <TR key={h.horse_id}>
                    <TD>{h.name}</TD>
                    <TD right mono>{fmt(BigInt(h.expense_cents))}</TD>
                    <TD right mono>{fmt(BigInt(h.income_cents))}</TD>
                    <TD right mono>
                      <span className={h.net_cents >= 0 ? "text-positive" : "text-negative"}>
                        {fmt(BigInt(h.net_cents))}
                      </span>
                    </TD>
                    <TD right mono>
                      {h.cost_per_start_cents != null ? fmt(BigInt(h.cost_per_start_cents)) : "—"}
                    </TD>
                    <TD right mono>{h.roi_pct != null ? `${h.roi_pct}%` : "—"}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      ) : null}
    </div>
  );
}
