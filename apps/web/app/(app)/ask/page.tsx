"use client";

import { useFormState, useFormStatus } from "react-dom";
import { ask, type AskState } from "./actions";
import { Card, CardHeader, Badge, inputClass } from "@/components/ui";

const SUGGESTIONS = [
  "How much cash do we have and what are we owed?",
  "Which owner owes the most?",
  "How much have we spent on Silk Road, and is it profitable?",
  "What happened in the books recently?",
];

function AskButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-fg transition hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Thinking…" : "Ask"}
    </button>
  );
}

export default function AskPage() {
  const [state, action] = useFormState<AskState, FormData>(ask, {});

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ask Tote</h1>
        <p className="mt-1 text-sm text-muted">
          Ask your books in plain English. Every figure is pulled from the ledger — grounded, not guessed.
        </p>
      </div>

      <Card>
        <form action={action} className="space-y-3 p-5">
          <textarea
            name="question"
            rows={3}
            defaultValue={state.question}
            placeholder="e.g. Which horse is costing the most with the least earnings?"
            className={inputClass}
          />
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.slice(0, 2).map((s) => (
                <span key={s} className="rounded-full bg-surface-2 px-2 py-1 text-[11px] text-muted">
                  {s}
                </span>
              ))}
            </div>
            <AskButton />
          </div>
        </form>
      </Card>

      {state.error ? (
        <Card>
          <div className="p-5 text-sm text-muted">{state.error}</div>
        </Card>
      ) : null}

      {state.answer ? (
        <Card>
          <CardHeader
            title="Answer"
            subtitle="Grounded in the ledger"
            action={
              state.toolsUsed && state.toolsUsed.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {[...new Set(state.toolsUsed)].map((t) => (
                    <Badge key={t} tone="brand">
                      {t}
                    </Badge>
                  ))}
                </div>
              ) : null
            }
          />
          <div className="whitespace-pre-wrap p-5 text-sm leading-relaxed text-fg">{state.answer}</div>
        </Card>
      ) : null}

      <p className="text-center text-xs text-muted">
        The copilot can only read the books — it can read balances, owners, and horses, but never post or change an
        entry.
      </p>
    </div>
  );
}
