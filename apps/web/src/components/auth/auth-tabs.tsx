"use client";

import Link from "next/link";

/** Segmented [ SIGN IN | SIGN UP ] switch — real routes, pass-card styled. */
export function AuthTabs({ mode }: { mode: "login" | "signup" | "reset" }) {
  const tabs = [
    { href: "/login", label: "Sign in", active: mode === "login" },
    { href: "/signup", label: "Sign up", active: mode === "signup" },
  ];

  return (
    <div className="mx-2 grid grid-cols-2 border-b border-line">
      {tabs.map((tab) => (
        <Link
          className={`py-2.5 text-center font-label text-[10px] tracking-[0.14em] uppercase transition-colors ${
            tab.active
              ? "border-b-2 border-accent text-accent"
              : "text-ink/50 hover:text-ink"
          }`}
          href={tab.href}
          key={tab.href}
        >
          [ {tab.label} ]
        </Link>
      ))}
    </div>
  );
}
