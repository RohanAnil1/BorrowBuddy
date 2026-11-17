import { ChevronLeft, ChevronRight, Search, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CountUp } from "@/components/app/impact-view";
import { initials, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/* Admin console building blocks. Server components unless noted: the client
   pieces (nav, drawer, charts) live in their own files. Uppercase is for
   labels and chrome only; anything a student wrote stays `normal-case`. */

export const inputClass =
  "w-full min-w-0 rounded-lg border border-line bg-black px-3 py-2.5 text-[14px] normal-case text-ink outline-none transition-colors placeholder:text-ink/40 focus:border-accent";

export const labelClass = "font-secondary text-[11px] text-ink/70";

export const buttonClass = {
  primary:
    "press inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 font-strong text-[13px] uppercase tracking-[0.04em] text-white transition-opacity hover:opacity-90",
  secondary:
    "press inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-ink/25 bg-black/50 px-4 py-2 font-strong text-[13px] uppercase tracking-[0.04em] text-ink transition-colors hover:border-accent hover:text-accent",
  quiet:
    "press inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 font-strong text-[12px] uppercase tracking-[0.04em] text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink",
} as const;

/** Page title block: eyebrow, title, one-line description, actions on the right. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  back,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-line pb-6 dt:flex-row dt:items-end dt:justify-between">
      <div className="min-w-0">
        {back && (
          <Link
            className="font-secondary mb-4 inline-flex min-h-8 items-center gap-1.5 text-[11px] text-ink/60 transition-colors hover:text-accent"
            href={back.href}
          >
            <ChevronLeft aria-hidden className="size-3.5" /> {back.label}
          </Link>
        )}
        <p className="status-bracket text-[11px]">[ {eyebrow} ]</p>
        {/* .type-title sizes itself outside Tailwind's layers, so size it inline. */}
        <h1 className="type-title mt-2 break-words" style={{ fontSize: "clamp(2rem, 5vw, 2.75rem)" }}>
          {title}
        </h1>
        {description && (
          <p className="type-body mt-2 max-w-[62ch] text-[14px] normal-case leading-6 text-ink/70">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A black card with a header strip. */
export function Panel({
  title,
  icon,
  count,
  action,
  tone = "default",
  className,
  bodyClassName,
  children,
  id,
}: {
  title?: string;
  icon?: ReactNode;
  count?: number | string;
  action?: ReactNode;
  tone?: "default" | "accent" | "danger";
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
  id?: string;
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "min-w-0 border bg-panel",
        tone === "danger" ? "border-warn/50" : tone === "accent" ? "border-accent/50" : "border-line",
        className,
      )}
      id={id}
    >
      {title && (
        <header className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-5 py-2.5">
          <h2
            className={cn(
              "font-secondary flex items-center gap-2 text-[11px]",
              tone === "danger" ? "text-warn" : "text-ink/80",
            )}
            id={headingId}
          >
            {icon && <span className={tone === "danger" ? "text-warn" : "text-accent"}>{icon}</span>}
            {title}
            {count !== undefined && <span className="tabular-nums text-ink/50">{count}</span>}
          </h2>
          {action}
        </header>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      className="font-secondary inline-flex min-h-8 items-center gap-1 text-[11px] text-accent transition-colors hover:text-ink"
      href={href}
    >
      {children} <ChevronRight aria-hidden className="size-3.5" />
    </Link>
  );
}

/** A labelled form control. */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className={labelClass}>{label}</span>
      {children}
      {hint && <span className="text-[12px] normal-case leading-5 text-ink/55">{hint}</span>}
    </label>
  );
}

/** Status filters as links, with counts. */
export function FilterChips({
  label,
  items,
}: {
  label: string;
  items: { key: string; label: string; href: string; count?: number; active: boolean }[];
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "font-secondary inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-[11px] transition-colors",
            item.active
              ? "border-accent bg-accent/15 text-accent"
              : "border-line text-ink/70 hover:border-ink/40 hover:text-ink",
          )}
          href={item.href}
          key={item.key}
          scroll={false}
        >
          {item.label}
          {item.count !== undefined && (
            <span className={cn("tabular-nums", item.active ? "text-accent" : "text-ink/50")}>{item.count}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

/** A GET search box (?q=) that keeps the other filters. */
export function SearchForm({
  action,
  defaultValue,
  placeholder,
  keep = {},
  clearHref,
}: {
  action: string;
  defaultValue?: string;
  placeholder: string;
  keep?: Record<string, string | undefined>;
  clearHref?: string;
}) {
  return (
    <form action={action} className="flex w-full min-w-0 items-center gap-2 dt:w-auto" role="search">
      {Object.entries(keep).map(([key, value]) =>
        value ? <input key={key} name={key} type="hidden" value={value} /> : null,
      )}
      <label className="relative flex min-w-0 flex-1 items-center dt:w-72 dt:flex-none">
        <span className="sr-only">{placeholder}</span>
        <Search aria-hidden className="pointer-events-none absolute left-3 size-4 text-ink/45" />
        <input
          className={cn(inputClass, "pl-9")}
          defaultValue={defaultValue}
          maxLength={100}
          name="q"
          placeholder={placeholder}
          type="search"
        />
      </label>
      <button className={buttonClass.secondary} type="submit">
        Search
      </button>
      {defaultValue && clearHref && (
        <Link className="font-secondary px-1 text-[11px] text-ink/60 hover:text-accent" href={clearHref}>
          Clear
        </Link>
      )}
    </form>
  );
}

/** Numbered pages: 1 … 4 5 6 … 12. */
export function Pagination({
  page,
  pages,
  hrefFor,
  summary,
}: {
  page: number;
  pages: number;
  hrefFor: (page: number) => string;
  summary?: string;
}) {
  if (pages <= 1) return summary ? <p className="font-secondary mt-4 text-[11px] text-ink/55">{summary}</p> : null;

  const shown = new Set([1, pages, page - 1, page, page + 1].filter((value) => value >= 1 && value <= pages));
  const sequence = [...shown].sort((a, b) => a - b);
  const cells: (number | "gap")[] = [];
  sequence.forEach((value, index) => {
    if (index > 0 && value - sequence[index - 1] > 1) cells.push("gap");
    cells.push(value);
  });

  const cell =
    "font-secondary inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-[11px] tabular-nums transition-colors";
  return (
    <nav aria-label="Pages" className="mt-5 flex flex-wrap items-center justify-between gap-3">
      {summary && <p className="font-secondary text-[11px] text-ink/55">{summary}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        {page > 1 && (
          <Link aria-label="Previous page" className={cn(cell, "border-line text-ink/70 hover:border-accent")} href={hrefFor(page - 1)}>
            <ChevronLeft aria-hidden className="size-3.5" />
          </Link>
        )}
        {cells.map((value, index) =>
          value === "gap" ? (
            <span aria-hidden className="px-1 text-ink/40" key={`gap-${index}`}>
              …
            </span>
          ) : (
            <Link
              aria-current={value === page ? "page" : undefined}
              className={cn(
                cell,
                value === page ? "border-accent bg-accent/15 text-accent" : "border-line text-ink/70 hover:border-accent",
              )}
              href={hrefFor(value)}
              key={value}
            >
              {value}
            </Link>
          ),
        )}
        {page < pages && (
          <Link aria-label="Next page" className={cn(cell, "border-line text-ink/70 hover:border-accent")} href={hrefFor(page + 1)}>
            <ChevronRight aria-hidden className="size-3.5" />
          </Link>
        )}
      </div>
    </nav>
  );
}

/** A table on desktop; each row stacks into a card under 800px (see .admin-table). */
export function DataTable({
  caption,
  columns,
  children,
}: {
  caption: string;
  columns: { label: string; className?: string }[];
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 border border-line bg-panel">
      <table className="admin-table w-full border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line">
            {columns.map((column) => (
              <th
                className={cn("font-secondary px-4 py-3 text-[11px] font-normal text-ink/60", column.className)}
                key={column.label}
                scope="col"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <tr className={cn("border-b border-line align-middle transition-colors last:border-b-0 hover:bg-ink/[0.03]", className)}>
      {children}
    </tr>
  );
}

export function Cell({
  label,
  children,
  className,
  hideOnMobile = false,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  hideOnMobile?: boolean;
}) {
  return (
    <td className={cn("px-4 py-3", className)} data-label={label} data-mobile={hideOnMobile ? "hide" : undefined}>
      {children}
    </td>
  );
}

/** Badge tone for each verification status. */
export const VERIFICATION_TONE = {
  verified: "success",
  pending: "info",
  rejected: "warning",
  suspended: "danger",
} as const;

/** Label / value pairs. */
export function KeyValue({ items, className }: { items: { label: string; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4", className)}>
      {items.map((item) => (
        <div className="min-w-0" key={item.label}>
          <dt className="font-secondary text-[11px] text-ink/55">{item.label}</dt>
          <dd className="mt-1 text-[15px] normal-case tabular-nums text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Avatar({ name, src, size = 40 }: { name: string; src?: string | null; size?: number }) {
  const style = { width: size, height: size };
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="" className="shrink-0 rounded-full border border-line object-cover" src={src} style={style} />
  ) : (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full border border-line bg-deep font-strong text-ink/85"
      style={{ ...style, fontSize: Math.max(11, Math.round(size * 0.34)) }}
    >
      {initials(name || "?")}
    </span>
  );
}

/** "Waiting 3d" — turns warn once it passes the stale threshold. */
export function WaitingTag({ since, stale }: { since: string; stale?: boolean }) {
  return (
    <span className={cn("font-secondary inline-flex items-center gap-1.5 text-[11px]", stale ? "text-warn" : "text-ink/55")}>
      {stale && <TriangleAlert aria-hidden className="size-3.5" />}
      {stale ? "Waiting " : ""}
      {relativeTime(since)}
    </span>
  );
}

/** A queue on the overview: the count, and how long the oldest item has waited. */
export function QueueTile({
  href,
  label,
  count,
  icon,
  oldest,
  stale,
  note,
}: {
  href: string;
  label: string;
  count: number;
  icon: ReactNode;
  oldest: string | null;
  stale: boolean;
  note?: string;
}) {
  return (
    <Link
      className={cn(
        "group flex min-h-36 flex-col justify-between gap-3 border bg-panel p-5 transition-colors hover:border-accent",
        count === 0 ? "border-line" : stale ? "border-warn/60" : "border-accent/50",
      )}
      href={href}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="font-secondary text-[11px] text-ink/75">{label}</span>
        <span className={cn("transition-colors group-hover:text-accent", count === 0 ? "text-ink/35" : "text-accent")}>
          {icon}
        </span>
      </span>
      <span className="type-title leading-none" style={{ fontSize: "2.75rem" }}>
        <CountUp value={count} />
      </span>
      <span className={cn("text-[12px] normal-case leading-5", stale ? "text-warn" : "text-ink/60")}>
        {count === 0
          ? "All clear"
          : `${note ? `${note} · ` : ""}oldest ${oldest ? relativeTime(oldest) : "—"}`}
      </span>
    </Link>
  );
}

/** A plain number with a label, for totals that aren't queues. */
export function StatCard({ label, value, hint, href }: { label: string; value: number; hint?: string; href?: string }) {
  const body = (
    <>
      <span className="font-secondary text-[11px] text-ink/70">{label}</span>
      <span className="type-title leading-none" style={{ fontSize: "2rem" }}>
        <CountUp value={value} />
      </span>
      {hint && <span className="text-[12px] normal-case leading-5 text-ink/60">{hint}</span>}
    </>
  );
  const className = "flex h-full flex-col gap-2 border border-line bg-panel p-5";
  return href ? (
    <Link className={cn(className, "transition-colors hover:border-accent")} href={href}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** Red-bordered section for actions that can't be undone. */
export function DangerZone({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel icon={<TriangleAlert aria-hidden className="size-3.5" />} title={title} tone="danger">
      {children}
    </Panel>
  );
}

/** URL-driven tabs (?tab=). */
export function Tabs({
  label,
  tabs,
  active,
}: {
  label: string;
  tabs: { key: string; label: string; href: string; count?: number; tone?: "danger" }[];
  active: string;
}) {
  return (
    <nav aria-label={label} className="rail-scroll -mx-4 flex overflow-x-auto overflow-y-hidden border-b border-line px-4 dt:mx-0 dt:px-0">
      {tabs.map((tab) => {
        const current = tab.key === active;
        return (
          <Link
            aria-current={current ? "page" : undefined}
            className={cn(
              "font-secondary relative inline-flex min-h-11 shrink-0 items-center gap-2 px-4 text-[11px] transition-colors",
              current ? (tab.tone === "danger" ? "text-warn" : "text-accent") : "text-ink/60 hover:text-ink",
            )}
            href={tab.href}
            key={tab.key}
            scroll={false}
          >
            {tab.label}
            {tab.count !== undefined && <span className="tabular-nums text-ink/45">{tab.count}</span>}
            {current && (
              <span
                aria-hidden
                className={cn("absolute inset-x-3 bottom-0 h-0.5", tab.tone === "danger" ? "bg-warn" : "bg-accent")}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** A notice strip, e.g. when a query failed. */
export function Notice({ tone = "warn", children }: { tone?: "warn" | "info"; children: ReactNode }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 border px-4 py-3 text-[13px] normal-case leading-5",
        tone === "warn" ? "border-warn/50 bg-warn/10 text-warn" : "border-line bg-panel text-ink/75",
      )}
      role={tone === "warn" ? "alert" : undefined}
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
