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
      {pending ? "Reading…" : "Draft vendor bill"}
    </button>
  );
}

export function ReceiptDrafter() {
  const [state, action] = useFormState<DraftState, FormData>(draftFromReceipt, {});

  return (
    <Card>
      <CardHeader title="Receipt → draft bill" subtitle="OCR text in, a pre-filled vendor bill out" />
      <form action={action} className="space-y-3 p-5">
        <textarea
          name="text"
          defaultValue={SAMPLE}
          rows={6}
          spellCheck={false}
          className={inputClass + " font-mono text-xs"}
        />
        <Submit />
        {state.error ? <p className="text-sm text-negative">{state.error}</p> : null}
        {state.draft ? (
          <div className="rounded-lg border border-border bg-surface-2 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold">Draft</span>
              <Badge tone={state.draft.confidence >= 0.75 ? "positive" : "gold"}>
                {Math.round(state.draft.confidence * 100)}% confident
              </Badge>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <dt className="text-muted">Vendor</dt>
              <dd className="text-fg">{state.draft.vendor ?? "—"}</dd>
              <dt className="text-muted">Amount</dt>
              <dd className="tabnum text-fg">{money(state.draft.amount_cents)}</dd>
              <dt className="text-muted">Category</dt>
              <dd className="text-fg">{state.draft.category ?? "—"}</dd>
              <dt className="text-muted">Date</dt>
              <dd className="text-fg">{state.draft.date ?? "—"}</dd>
            </dl>
          </div>
        ) : null}
      </form>
    </Card>
  );
}
