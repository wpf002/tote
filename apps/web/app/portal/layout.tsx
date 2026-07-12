import { requireUser } from "@/lib/tenant";
import { logout } from "@/app/(app)/actions";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-fg">
              T
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">Owner Portal</div>
              <div className="text-[11px] text-muted">{user.email}</div>
            </div>
          </div>
          <form action={logout}>
            <button className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-fg">
              Sign Out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">{children}</main>
    </div>
  );
}
