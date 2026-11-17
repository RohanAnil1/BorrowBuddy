import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { Profile } from "@borrowbuddy/shared";
import { CargoMark } from "@/components/landing/hero";
import { StatusTicker } from "@/components/landing/status-ticker";
import { initials } from "@/lib/format";
import { NavLink } from "./nav-link";
import { NotificationBell } from "./notification-bell";

const DESKTOP_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/home", label: "Browse" },
  { href: "/chat", label: "Chat" },
  { href: "/map", label: "Map" },
  { href: "/campus", label: "Campus" },
  { href: "/assistant", label: "Buddy" },
];

export function AppShell({
  profile,
  unreadCount,
  pendingCount,
  adminQueue = 0,
  children,
}: {
  profile: Profile;
  unreadCount: number;
  pendingCount: number;
  /** Items waiting in the admin console's queues (admins only). */
  adminQueue?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <StatusTicker />

      <header className="sticky top-[env(safe-area-inset-top)] z-40 border-b border-line bg-black">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 px-4 pt-3 dt:flex-nowrap dt:px-10">
          <Link aria-label="BorrowBuddy — home" className="flex items-center gap-2.5" href="/home">
            <CargoMark className="size-8" />
            <span className="font-secondary text-[12px] text-ink">BORROWBUDDY</span>
          </Link>

          <nav className="order-last -mx-1 flex w-full flex-wrap items-center gap-1 pb-1.5 dt:order-none dt:mx-0 dt:w-auto dt:pb-0">
            {DESKTOP_LINKS.map((link) => (
              <NavLink
                className="type-body rounded-lg px-3 py-1.5 text-[13px] uppercase text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink dt:px-4 dt:py-2"
                href={link.href}
                key={link.href}
              >
                {link.label}
              </NavLink>
            ))}
            <NavLink
              className="type-body flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] uppercase text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink dt:px-4 dt:py-2"
              href="/my/items"
            >
              My items
              {pendingCount > 0 && (
                <span className="bg-accent px-1.5 py-0.5 font-secondary text-[9px] text-white">
                  {pendingCount}
                </span>
              )}
            </NavLink>
          </nav>

          <div className="flex items-center gap-2">
            {profile.is_admin && (
              <NavLink
                className="font-secondary flex min-h-9 items-center gap-1.5 rounded-lg border border-accent/50 px-2.5 text-[11px] text-accent transition-colors hover:border-accent hover:bg-accent/10"
                href="/admin"
              >
                <ShieldCheck aria-hidden className="size-4" />
                <span className="hidden sm:inline">Admin</span>
                <span className="sr-only sm:hidden">Admin console</span>
                {adminQueue > 0 && (
                  <span className="min-w-5 rounded-full bg-accent px-1.5 text-center text-[11px] tabular-nums text-white">
                    <span className="sr-only">, waiting: </span>
                    {adminQueue}
                  </span>
                )}
              </NavLink>
            )}
            <NotificationBell unreadCount={unreadCount} userId={profile.id} />
            <Link
              className="flex size-9 items-center justify-center bg-panel font-title text-sm text-ink"
              href="/me"
            >
              {initials(profile.full_name || profile.email)}
            </Link>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col pb-[calc(2rem+env(safe-area-inset-bottom))]">{children}</main>
    </div>
  );
}
