import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { Sidebar } from "@/components/sidebar";
import { EntitySwitcher } from "@/components/entity-switcher";
import { logout } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, legalEntityId, legalEntities } = await getTenant();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-fg">
            T
          </div>
          <span className="text-base font-semibold tracking-tight">Tote</span>
        </div>
        <Sidebar />
        <div className="mt-auto px-5 py-4 text-xs text-muted">Immutable ledger · penny-exact</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-border bg-surface/80 px-6 py-3 backdrop-blur">
          <EntitySwitcher entities={legalEntities} activeId={legalEntityId} />
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs font-medium text-fg">{user.email}</div>
              <div className="text-[11px] uppercase tracking-wide text-muted">{user.role}</div>
            </div>
            <form action={logout}>
              <button className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-fg">
                Sign out
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1 px-6 py-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
