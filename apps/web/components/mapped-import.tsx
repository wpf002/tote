"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { ImportOutcome } from "@/app/(app)/import/actions";
import { Card, CardHeader, Field, Badge, inputClass } from "@/components/ui";

export interface FieldSpec {
  key: string;
  label: string;
}

type Action = (prev: ImportOutcome, formData: FormData) => Promise<ImportOutcome>;

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-fg transition hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Importing…" : label}
    </button>
  );
}

export function MappedImport({
  title,
  subtitle,
  fields,
  presets,
  sample,
  action,
}: {
  title: string;
  subtitle: string;
  fields: FieldSpec[];
  /** presetName -> { fieldKey: columnHeader } */
  presets: Record<string, Record<string, string>>;
  sample: string;
  action: Action;
}) {
  const presetNames = Object.keys(presets);
  const [preset, setPreset] = useState(presetNames[0]!);
  const [mapping, setMapping] = useState<Record<string, string>>({ ...presets[presetNames[0]!] });
  const [state, formAction] = useFormState<ImportOutcome, FormData>(action, {});

  function applyPreset(name: string) {
    setPreset(name);
    setMapping({ ...presets[name] });
  }

  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={subtitle}
        action={
          presetNames.length > 1 ? (
            <select
              value={preset}
              onChange={(e) => applyPreset(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-fg outline-none focus:border-brand"
            >
              {presetNames.map((n) => (
                <option key={n} value={n}>
                  {n} preset
                </option>
              ))}
            </select>
          ) : null
        }
      />
      <form action={formAction} className="space-y-4 p-5">
        <textarea
          name="csv"
          defaultValue={sample}
          rows={5}
          spellCheck={false}
          className={inputClass + " font-mono text-xs"}
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {fields.map((f) => (
            <Field key={f.key} label={f.label}>
              <input
                name={`col_${f.key}`}
                value={mapping[f.key] ?? ""}
                onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                className={inputClass}
              />
            </Field>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Submit label={`Import ${title}`} />
          {state.error ? <span className="text-sm text-negative">{state.error}</span> : null}
          {state.ok && state.summary
            ? state.summary.map((s, i) => (
                <span key={i} className="text-sm text-positive">
                  {s}
                </span>
              ))
            : null}
        </div>

        {state.warnings && state.warnings.length > 0 ? (
          <div className="rounded-lg bg-gold/10 p-3 text-xs text-muted">
            <div className="mb-1 flex items-center gap-2">
              <Badge tone="gold">{state.warnings.length} warnings</Badge>
            </div>
            <ul className="space-y-0.5">
              {state.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {state.errors && state.errors.length > 0 ? (
          <div className="rounded-lg bg-negative/10 p-3 text-xs text-muted">
            <div className="mb-1 flex items-center gap-2">
              <Badge tone="negative">{state.errors.length} skipped</Badge>
            </div>
            <ul className="space-y-0.5">
              {state.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </form>
    </Card>
  );
}
