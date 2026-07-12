"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface Item {
  href: string;
  label: string;
  icon: string;
}

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "▚" },
      { href: "/insights", label: "Insights", icon: "✧" },
    ],
  },
  {
    title: "Billing",
    items: [
      { href: "/invoices", label: "Invoices", icon: "▧" },
      { href: "/vendor-bills", label: "Vendor Bills", icon: "▦" },
      { href: "/purses", label: "Purses", icon: "◆" },
    ],
  },
  {
    title: "Records",
    items: [
      { href: "/horses", label: "Horses", icon: "▤" },
      { href: "/owners", label: "Owners & Parties", icon: "◍" },
    ],
  },
  {
    title: "Month-end",
    items: [
      { href: "/reconcile", label: "Reconcile", icon: "⇄" },
      { href: "/audit", label: "Ledger Audit", icon: "✓" },
      { href: "/exports", label: "Exports", icon: "▲" },
    ],
  },
];

const MORE: Item[] = [
  { href: "/racing", label: "Racing", icon: "▰" },
  { href: "/operations", label: "Operations", icon: "▣" },
  { href: "/tax", label: "Tax & Assets", icon: "§" },
  { href: "/import", label: "Import", icon: "▼" },
  { href: "/capture", label: "Barn Capture", icon: "◎" },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLink({ item, active }: { item: Item; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition " +
        (active ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-2 hover:text-fg")
      }
    >
      <span aria-hidden className="w-4 text-center text-xs opacity-70">
        {item.icon}
      </span>
      {item.label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const moreActive = MORE.some((i) => isActive(pathname, i.href));
  const [moreOpen, setMoreOpen] = useState(false);
  const showMore = moreOpen || moreActive;

  return (
    <div className="flex flex-col px-3">
      {/* Ask Tote — promoted to a command bar, not a nav row */}
      <Link
        href="/ask"
        className={
          "mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition " +
          (isActive(pathname, "/ask")
            ? "border-brand/50 bg-brand-soft text-brand"
            : "border-border bg-surface text-muted hover:border-brand/40 hover:text-fg")
        }
      >
        <span aria-hidden className="text-brand">
          ✦
        </span>
        Ask your books…
      </Link>

      {GROUPS.map((group) => (
        <div key={group.title} className="mb-1">
          <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted/70">
            {group.title}
          </div>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
            ))}
          </div>
        </div>
      ))}

      {/* More — the deeper feature areas, tucked away until needed */}
      <div className="mb-1">
        <button
          onClick={() => setMoreOpen((v) => !v)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted/70 transition hover:text-fg"
        >
          <span aria-hidden className={"text-xs transition-transform " + (showMore ? "rotate-90" : "")}>
            ›
          </span>
          More
        </button>
        {showMore ? (
          <div className="flex flex-col gap-0.5">
            {MORE.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
