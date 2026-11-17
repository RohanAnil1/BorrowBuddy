"use client";

import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Flag,
  LayoutDashboard,
  MapPin,
  MessagesSquare,
  PackageSearch,
  Receipt,
  ScrollText,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type NavCounts = {
  verifications: number;
  reports: number;
  incidents: number;
  fines: number;
  claims: number;
  students: number;
  groups: number;
  pins: number;
};

type CountKey = keyof NavCounts;

type Item = { href: string; label: string; icon: LucideIcon; count?: CountKey; queue?: boolean };

const GROUPS: { label: string; items: Item[] }[] = [
  { label: "Console", items: [{ href: "/admin", label: "Overview", icon: LayoutDashboard }] },
  {
    label: "Queues",
    items: [
      { href: "/admin/verifications", label: "Verifications", icon: BadgeCheck, count: "verifications", queue: true },
      { href: "/admin/reports", label: "Reports", icon: Flag, count: "reports", queue: true },
      { href: "/admin/incidents", label: "Incidents", icon: AlertTriangle, count: "incidents", queue: true },
      { href: "/admin/fines", label: "Fines", icon: Receipt, count: "fines", queue: true },
      { href: "/admin/claims", label: "Lost & found claims", icon: PackageSearch, count: "claims", queue: true },
    ],
  },
  {
    label: "Directory",
    items: [
      { href: "/admin/students", label: "Students", icon: Users, count: "students" },
      { href: "/admin/groups", label: "Group chats", icon: MessagesSquare, count: "groups" },
    ],
  },
  { label: "Campus", items: [{ href: "/admin/pins", label: "Pickup spots", icon: MapPin, count: "pins" }] },
  { label: "Records", items: [{ href: "/admin/audit", label: "Audit log", icon: ScrollText }] },
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

function Badge({ item, counts, stale }: { item: Item; counts: NavCounts; stale: Partial<Record<CountKey, boolean>> }) {
  if (!item.count) return null;
  const value = counts[item.count];
  if (item.queue) {
    if (value === 0) return null;
    return (
      <span
        className={cn(
          "font-secondary ml-auto inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] tabular-nums",
          stale[item.count] ? "bg-warn text-black" : "bg-accent text-white",
        )}
      >
        <span className="sr-only">{stale[item.count] ? "waiting too long: " : "waiting: "}</span>
        {value}
      </span>
    );
  }
  return <span className="font-secondary ml-auto text-[11px] tabular-nums text-ink/45">{value}</span>;
}

/**
 * The console's navigation: a sticky sidebar from 800px, a scrolling chip rail
 * on phones. Queue items carry a count badge that turns warn-orange when the
 * oldest item has waited too long.
 */
export function AdminNav({
  counts,
  stale,
  adminName,
}: {
  counts: NavCounts;
  stale: Partial<Record<CountKey, boolean>>;
  adminName: string;
}) {
  const pathname = usePathname() ?? "";
  const items = GROUPS.flatMap((group) => group.items);
  const rail = useRef<HTMLUListElement>(null);

  // Phones: bring the current section's chip into view in the rail.
  useEffect(() => {
    const current = rail.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!current || !rail.current) return;
    const { offsetLeft, offsetWidth } = current;
    rail.current.scrollTo({ left: offsetLeft - (rail.current.clientWidth - offsetWidth) / 2 });
  }, [pathname]);

  return (
    <>
      {/* Phones and narrow windows: one scrolling rail. */}
      <nav aria-label="Admin sections" className="border-b border-line bg-black dt:hidden">
        <div className="flex items-center justify-between gap-3 px-4 pt-3">
          <p className="status-bracket text-[11px]">[ CONTROL ROOM ]</p>
          <Link className="font-secondary inline-flex min-h-8 items-center gap-1.5 text-[11px] text-ink/60 hover:text-accent" href="/dashboard">
            <ArrowLeft aria-hidden className="size-3.5" /> App
          </Link>
        </div>
        <ul className="rail-scroll relative flex gap-2 overflow-x-auto px-4 pt-3 pb-3" ref={rail}>
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li className="shrink-0" key={item.href}>
                <Link
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "font-secondary inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-[11px] transition-colors",
                    active ? "border-accent bg-accent/15 text-accent" : "border-line text-ink/75 hover:border-ink/40",
                  )}
                  href={item.href}
                >
                  <Icon aria-hidden className="size-4" />
                  {item.label}
                  {item.queue && <Badge counts={counts} item={item} stale={stale} />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Desktop: sticky sidebar. */}
      <aside className="hidden w-64 shrink-0 border-r border-line bg-black dt:block">
        <div className="sticky top-[calc(4.25rem+env(safe-area-inset-top))] flex max-h-[calc(100dvh-4.25rem)] flex-col overflow-y-auto">
          <div className="border-b border-line px-5 py-5">
            <p className="status-bracket text-[11px]">[ CONTROL ROOM ]</p>
            <p className="type-body-alt mt-2 truncate text-[14px] normal-case">{adminName}</p>
            <p className="font-secondary mt-1 inline-flex items-center gap-1.5 text-[11px] text-ink/55">
              <span aria-hidden className="size-1.5 rounded-full bg-accent" /> Admin access
            </p>
          </div>

          <nav aria-label="Admin sections" className="flex-1 px-3 py-4">
            {GROUPS.map((group) => (
              <div className="mb-4 last:mb-0" key={group.label}>
                <p className="font-secondary px-3 pb-1.5 text-[11px] text-ink/45">{group.label}</p>
                <ul className="flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const active = isActive(pathname, item.href);
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] uppercase transition-colors",
                            active ? "bg-ink/[0.07] text-ink" : "text-ink/70 hover:bg-ink/[0.04] hover:text-ink",
                          )}
                          href={item.href}
                        >
                          {active && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />}
                          <Icon aria-hidden className={cn("size-4 shrink-0", active ? "text-accent" : "text-ink/50")} />
                          <span className="truncate">{item.label}</span>
                          <Badge counts={counts} item={item} stale={stale} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <div className="border-t border-line p-3">
            <Link
              className="font-secondary flex min-h-10 items-center gap-2 rounded-lg px-3 text-[11px] text-ink/60 transition-colors hover:bg-ink/[0.04] hover:text-accent"
              href="/dashboard"
            >
              <ArrowLeft aria-hidden className="size-3.5" /> Back to the app
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
