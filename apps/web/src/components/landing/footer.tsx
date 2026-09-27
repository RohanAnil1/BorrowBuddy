import Link from "next/link";
import { CargoMark } from "./hero";

const LINKS = [
  { label: "HOW IT WORKS", href: "#queue" },
  { label: "PICKUP SPOTS", href: "#map" },
  { label: "SIGN IN", href: "/login" },
];

export function LandingFooter() {
  return (
    <footer className="relative bg-black">
      <div className="flex w-full flex-col items-start justify-between gap-10 px-4 py-12 dt:flex-row dt:items-end dt:px-10 dt:py-14">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <CargoMark className="size-9" />
            <span className="font-secondary text-ink">BORROWBUDDY</span>
          </div>
          <p className="font-secondary text-[10px] leading-5 text-ink/50">
            THE CAMPUS LENDING NETWORK · BENNETT UNIVERSITY
            <br />
            BORROW WHAT YOU NEED. LEND WHAT YOU DON&apos;T.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {LINKS.map((link) => (
            <Link
              className="type-body w-fit text-[14px] uppercase transition-colors hover:text-accent"
              href={link.href}
              key={link.label}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <ConstructionMark className="w-32 shrink-0" />
      </div>
    </footer>
  );
}

function ConstructionMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 134 144"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M33.3133 0L62.1634 49.9699L4.46313 49.9699L33.3133 0Z" fill="#f0f0f0" />
      <rect fill="#f0f0f0" height="66.6265" width="15.0447" x="25.7921" y="49.4321" />
      <path d="M99.9392 0L128.789 49.9699L71.0891 49.9699L99.9392 0Z" fill="#f0f0f0" />
      <rect fill="#f0f0f0" height="66.6265" width="15.0447" x="92.4102" y="49.4321" />
      <rect
        fill="#f0f0f0"
        height="81.6712"
        width="15.0447"
        x="107.455"
        y="128.955"
        transform="rotate(90 107.455 128.955)"
      />
    </svg>
  );
}
