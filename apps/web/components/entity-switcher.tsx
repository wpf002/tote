"use client";

import { useRef } from "react";
import { switchEntity } from "@/app/(app)/actions";

export function EntitySwitcher({
  entities,
  activeId,
}: {
  entities: Array<{ id: string; name: string; type: string }>;
  activeId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={switchEntity}>
      <select
        name="legalEntityId"
        defaultValue={activeId}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg outline-none focus:border-brand"
      >
        {entities.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
    </form>
  );
}
