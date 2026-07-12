"use client";

import { useFormState, useFormStatus } from "react-dom";
import { draftFromReceipt, type DraftState } from "./actions";
import { Card, CardHeader, Badge, inputClass } from "@/components/ui";

const SAMPLE = `Ridgeline Equine Vet
Invoice Date: 06/09/2026
Lameness exam        350.00
Radiographs          600.00
Total Amount Due   $1,250.00`;

function money(cents: number | null): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-fg transition hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Reading…" : "Draft Vendor Bill"}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

export function ReceiptDrafter() {
  const [state, action] = useFormState<DraftState, FormData>(draftFromReceipt, {});
  const draft = state.draft;

  return (
    <Card>
      <CardHeader title="Receipt Drafter" subtitle="Paste a receipt; get a pre-filled vendor bill back" />
      <form action={action} className="grid gap-6 p-5 md:grid-cols-2">
        {/* Left: paste */}
        <div className="space-y-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted">
            Paste Receipt Text
          </label>
          <textarea
            name="text"
            defaultValue={SAMPLE}
            rows={8}
            spellCheck={false}
            className={inputClass + " font-mono text-xs leading-relaxed"}
          />
          <div className="flex items-center gap-3">
            <Submit />
            {state.error ? <span className="text-sm text-negative">{state.error}</span> : null}
          </div>
        </div>

        {/* Right: draft preview */}
        <div>
          {draft ? (
            <div className="rounded-xl border border-border bg-surface-2 p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-semibold text-fg">Drafted Bill</span>
                <Badge tone={draft.confidence >= 0.75 ? "positive" : "gold"}>
                  {Math.round(draft.confidence * 100)}% Confident
                </Badge>
              </div>
              <div className="space-y-4">
                <Field label="Vendor">
                  <span className="text-base font-medium text-fg">{draft.vendor ?? "—"}</span>
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Amount">
                    <span className="tabnum text-xl font-semibold text-fg">{money(draft.amount_cents)}</span>
                  </Field>
                  <Field label="Date">
                    <span className="text-base text-fg">{draft.date ?? "—"}</span>
                  </Field>
                </div>
                <Field label="Category">
                  {draft.category ? <Badge tone="brand">{draft.category}</Badge> : <span className="text-muted">—</span>}
                </Field>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[200px] items-center justify-center rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
              The drafted vendor bill will appear here.
            </div>
          )}
        </div>
      </form>
    </Card>
  );
}
