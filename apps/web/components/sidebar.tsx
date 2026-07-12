"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "▚" },
  { href: "/horses", label: "Horses", icon: "▤" },
  { href: "/owners", label: "Owners & Parties", icon: "◍" },
  { href: "/vendor-bills", label: "Vendor Bills", icon: "▦" },
  { href: "/invoices", label: "Invoices", icon: "▧" },
  { href: "/purses", label: "Purses", icon: "◆" },
  { href: "/racing", label: "Racing", icon: "▰" },
  { href: "/operations", label: "Operations", icon: "▣" },
  { href: "/tax", label: "Tax & Assets", icon: "§" },
  { href: "/import", label: "Import", icon: "▼" },
  { href: "/reconcile", label: "Reconcile", icon: "⇄" },
  { href: "/exports", label: "Exports", icon: "▲" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition " +
              (active
                ? "bg-brand-soft text-brand"
                : "text-muted hover:bg-surface-2 hover:text-fg")
            }
          >
            <span aria-hidden className="w-4 text-center text-xs opacity-70">
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
