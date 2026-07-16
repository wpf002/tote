"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowsLeftRight,
  Camera,
  CaretRight,
  ChartLine,
  DownloadSimple,
  Export,
  FileText,
  FlagCheckered,
  Horse,
  Receipt,
  Scales,
  SealCheck,
  Sparkle,
  SquaresFour,
  Trophy,
  Users,
  Wrench,
  type Icon,
} from "@phosphor-icons/react";

interface Item {
  href: string;
  label: string;
  icon: Icon;
}

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: SquaresFour },
      { href: "/insights", label: "Insights", icon: ChartLine },
    ],
  },
  {
    title: "Billing",
    items: [
      { href: "/invoices", label: "Invoices", icon: FileText },
      { href: "/vendor-bills", label: "Vendor Bills", icon: Receipt },
      { href: "/purses", label: "Purses", icon: Trophy },
    ],
  },
  {
    title: "Records",
    items: [
      { href: "/horses", label: "Horses", icon: Horse },
      { href: "/owners", label: "Owners & Parties", icon: Users },
    ],
  },
  {
    title: "Month-End",
    items: [
      { href: "/reconcile", label: "Reconcile", icon: ArrowsLeftRight },
      { href: "/audit", label: "Ledger Audit", icon: SealCheck },
      { href: "/exports", label: "Exports", icon: Export },
    ],
  },
];

const MORE: Item[] = [
  { href: "/racing", label: "Racing", icon: FlagCheckered },
  { href: "/operations", label: "Operations", icon: Wrench },
  { href: "/tax", label: "Tax & Assets", icon: Scales },
  { href: "/import", label: "Import", icon: DownloadSimple },
  { href: "/capture", label: "Barn Capture", icon: Camera },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLink({ item, active }: { item: Item; active: boolean }) {
  const Glyph = item.icon;
  return (
    <Link
      href={item.href}
      className={
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition " +
        (active ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-2 hover:text-fg")
      }
    >
      <Glyph aria-hidden size={18} weight={active ? "fill" : "regular"} className="shrink-0" />
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
        <Sparkle aria-hidden size={16} weight="fill" className="shrink-0 text-brand" />
        Ask Your Books…
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
          <CaretRight
            aria-hidden
            size={12}
            weight="bold"
            className={"shrink-0 transition-transform " + (showMore ? "rotate-90" : "")}
          />
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
