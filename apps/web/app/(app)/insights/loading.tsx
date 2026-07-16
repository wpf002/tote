import { Card } from "@/components/ui";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
        <p className="mt-1 text-sm text-muted">Receipt drafting, cash-flow forecast, and horse ROI</p>
      </div>

      <Card className="animate-pulse">
        <div className="border-b border-border px-5 py-4">
          <div className="h-4 w-24 rounded bg-surface-2" />
          <div className="mt-2 h-3 w-64 rounded bg-surface-2" />
        </div>
        <div className="divide-y divide-border/60">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-start gap-4 px-5 py-4">
              <span className="h-5 w-16 shrink-0 rounded-full bg-surface-2" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-1/3 rounded bg-surface-2" />
                <div className="h-3 w-3/4 rounded bg-surface-2" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
