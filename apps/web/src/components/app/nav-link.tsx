"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Extra path prefixes that belong to a tab (an item page lives under Browse). */
const SECTIONS: Record<string, string[]> = {
  "/home": ["/home", "/items"],
  "/my/items": ["/my"],
};

/** Header nav link that marks the current section for sighted and screen-reader users. */
export function NavLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const prefixes = SECTIONS[href] ?? [href];
  const active = prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(className, "relative", active && "bg-ink/5 text-ink")}
      href={href}
    >
      {children}
      {active && (
        <span aria-hidden className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent dt:inset-x-4" />
      )}
    </Link>
  );
}
