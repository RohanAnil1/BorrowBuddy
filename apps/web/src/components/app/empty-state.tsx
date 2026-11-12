import type { ReactNode } from "react";
import { Parcel, type ParcelMood } from "@/components/assistant/mascot/parcel";
import { cn } from "@/lib/utils";

/**
 * One empty state for the whole app. Pass `mood` to let Parcel stand in for
 * the icon; `compact` fits inside lists and tab panels.
 */
export function EmptyState({
  icon,
  mood,
  title,
  body,
  action,
  code = "EMPTY SHELF",
  compact = false,
  className,
}: {
  icon?: ReactNode;
  mood?: ParcelMood;
  title: string;
  body: string;
  action?: ReactNode;
  code?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex border border-line bg-panel text-center",
        compact ? "flex-col items-center gap-1 px-5 py-7 sm:flex-row sm:gap-5 sm:text-left" : "flex-col items-center px-6 py-12",
        className,
      )}
    >
      {mood ? (
        <Parcel mood={mood} size={compact ? 72 : 112} />
      ) : (
        icon && <span className="text-accent">{icon}</span>
      )}
      <div className={cn("flex flex-col", compact ? "items-center sm:items-start" : "items-center")}>
        <p className={cn("status-bracket text-[11px]", !compact && "mt-4")}>[ {code} ]</p>
        {/* .type-title sets its own size outside Tailwind's layers, so size it inline. */}
        <h2 className={cn("type-title", compact ? "mt-1" : "mt-3")} style={{ fontSize: compact ? "1.5rem" : "2rem" }}>
          {title}
        </h2>
        <p className="type-body mt-2 max-w-sm text-[13px] normal-case leading-6 text-ink/75">{body}</p>
        {action && <div className={compact ? "mt-4" : "mt-8"}>{action}</div>}
      </div>
    </div>
  );
}
