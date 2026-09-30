"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The BorrowBuddy wordmark, used as the home button on public pages. It links
 * to the landing page; when pressed while already there, it scrolls back to
 * the top instead of navigating to the same route again.
 */
export function WordmarkLink({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <Link
      aria-label="BorrowBuddy — home"
      className={className}
      href="/"
      onClick={(event) => {
        if (pathname === "/") {
          event.preventDefault();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }}
    >
      {children}
    </Link>
  );
}
