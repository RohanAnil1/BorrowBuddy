import { Bell, Compass, Inbox, MessagesSquare, PlusCircle, User } from "lucide-react";
import Link from "next/link";
import type { Profile } from "@borrowbuddy/shared";
import { CargoMark } from "@/components/landing/hero";
import { StatusTicker } from "@/components/landing/status-ticker";
import { initials } from "@/lib/format";

const DESKTOP_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/home", label: "Browse" },
  { href: "/chat", label: "Chat" },
  { href: "/map", label: "Map" },
];

const MOBILE_LINKS = [
  { href: "/dashboard", label: "Home", icon: Compass },
  { href: "/my/borrows", label: "Borrows", icon: Inbox },
  { href: "/items/new", label: "List", icon: PlusCircle },
  { href: "/chat", label: "Chat", icon: MessagesSquare },
  { href: "/me", label: "You", icon: User },
];

export function AppShell({
  profile,
  unreadCount,
  pendingCount,
  children,
}: {
  profile: Profile;
  unreadCount: number;
  pendingCount: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <StatusTicker />

      <header className="sticky top-0 z-40 border-b border-line bg-black">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 dt:px-10">
          <Link className="flex items-center gap-2.5" href="/dashboard">
            <CargoMark className="size-8" />
            <span className="font-secondary text-[12px] text-ink">BORROWBUDDY</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {DESKTOP_LINKS.map((link) => (
              <Link
                className="type-body rounded-lg px-4 py-2 text-[13px] uppercase text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink"
                href={link.href}
                key={link.href}
              >
                {link.label}
              </Link>
            ))}
            <Link
              className="type-body flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] uppercase text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink"
              href="/my/items"
            >
              My items
              {pendingCount > 0 && (
                <span className="bg-accent px-1.5 py-0.5 font-secondary text-[9px] text-white">
                  {pendingCount}
                </span>
              )}
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            {profile.is_admin && (
              <Link
                className="hidden font-secondary text-[10px] uppercase text-ink/50 transition-colors hover:text-accent sm:inline-flex"
                href="/admin"
              >
                [ ADMIN ]
              </Link>
            )}
            <Link
              aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
              className="relative flex size-9 items-center justify-center rounded-lg border border-line text-ink/60 transition-colors hover:border-accent hover:text-accent"
              href="/notifications"
            >
              <Bell className="size-4" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center bg-accent font-secondary text-[8px] text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
            <Link
              className="flex size-9 items-center justify-center bg-panel font-title text-sm text-ink"
              href="/me"
            >
              {initials(profile.full_name || profile.email)}
            </Link>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col pb-20 md:pb-0">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-black md:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-between px-2">
          {MOBILE_LINKS.map((link) => (
            <Link
              className="relative flex flex-1 flex-col items-center gap-1 py-3 font-secondary text-[8px] text-ink/50 transition-colors hover:text-accent"
              href={link.href}
              key={link.href}
            >
              <link.icon className="size-5" />
              {link.label.toUpperCase()}
              {link.href === "/my/borrows" && pendingCount > 0 && (
                <span className="absolute right-3 top-2 size-2 bg-accent" />
              )}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
