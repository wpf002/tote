"use client";

import { useFormState, useFormStatus } from "react-dom";
import { login } from "./actions";
import { Field, inputClass } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg transition hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(login, {});

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-lg font-bold text-brand-fg">
            T
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Tote</h1>
          <p className="mt-1 text-sm text-muted">Racing accounting, to the penny.</p>
        </div>

        <form action={formAction} className="space-y-4 rounded-xl border border-border bg-surface p-6 shadow-card">
          <Field label="Email">
            <input name="email" type="email" autoComplete="email" className={inputClass} placeholder="you@barn.com" />
          </Field>
          <Field label="Password">
            <input name="password" type="password" autoComplete="current-password" className={inputClass} placeholder="••••••••" />
          </Field>
          {state?.error ? (
            <p className="rounded-lg bg-negative/10 px-3 py-2 text-xs text-negative">{state.error}</p>
          ) : null}
          <SubmitButton />
        </form>

        <p className="mt-4 text-center text-xs text-muted">
          Demo: <span className="font-medium text-fg">staff@meadowbrook.test</span> / <span className="font-medium text-fg">tote1234</span>
        </p>
      </div>
    </main>
  );
}
