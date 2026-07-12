"use client";

import { useFormState, useFormStatus } from "react-dom";
import { importBills, type ImportState } from "./actions";
import { Card, CardHeader, Field, inputClass } from "@/components/ui";

const SAMPLE = `Date,Vendor,Horse,Category,Memo,Amount
2026-06-03,Ridgeline Equine Vet,Thunderbolt,Veterinary,Lameness exam,"$1,250.00"
2026-06-05,Iron & Anvil Farrier,Silk Road,Farrier,Full set,180.00
2026-06-08,GallopWay Transport,Halley's Comet,Transport,Ship to Keeneland,540.00`;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-fg transition hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Importing…" : "Import bills"}
    </button>
  );
}

export default function ImportPage() {
  const [state, action] = useFormState<ImportState, FormData>(importBills, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import</h1>
        <p className="mt-1 text-sm text-muted">
          Paste a barn&apos;s spreadsheet, map the columns, and land a whole month of vendor bills —
          missing vendors, horses, and categories are created automatically.
        </p>
      </div>

      <form action={action} className="space-y-6">
        <Card>
          <CardHeader title="1 · Paste CSV" subtitle="Copy rows straight from Excel or Google Sheets" />
          <div className="p-5">
            <textarea
              name="csv"
              defaultValue={SAMPLE}
              rows={8}
              spellCheck={false}
              className={inputClass + " font-mono text-xs"}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="2 · Map columns" subtitle="Which header holds each field" />
          <div className="grid grid-cols-2 gap-4 p-5 md:grid-cols-3">
            <Field label="Date column">
              <input name="col_date" defaultValue="Date" className={inputClass} />
            </Field>
            <Field label="Vendor column">
              <input name="col_vendor" defaultValue="Vendor" className={inputClass} />
            </Field>
            <Field label="Amount column">
              <input name="col_amount" defaultValue="Amount" className={inputClass} />
            </Field>
            <Field label="Horse column">
              <input name="col_horse" defaultValue="Horse" className={inputClass} />
            </Field>
            <Field label="Category column">
              <input name="col_category" defaultValue="Category" className={inputClass} />
            </Field>
            <Field label="Memo column">
              <input name="col_description" defaultValue="Memo" className={inputClass} />
            </Field>
          </div>
        </Card>

        <div className="flex items-center gap-4">
          <SubmitButton />
          {state.error ? <span className="text-sm text-negative">{state.error}</span> : null}
          {state.ok ? (
            <span className="text-sm text-positive">
              Imported {state.imported} bill{state.imported === 1 ? "" : "s"} · {state.total}
              {state.errors && state.errors.length > 0 ? ` · ${state.errors.length} skipped` : ""}
            </span>
          ) : null}
        </div>

        {state.errors && state.errors.length > 0 ? (
          <Card>
            <CardHeader title="Skipped rows" />
            <ul className="space-y-1 p-5 text-sm text-muted">
              {state.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </Card>
        ) : null}
      </form>
    </div>
  );
}
