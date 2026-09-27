import { cn } from "@/lib/utils";

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "muted";

const TONES: Record<Tone, string> = {
  neutral: "border-line bg-panel text-ink/70",
  info: "border-ink/50 bg-black text-ink",
  success: "border-accent/60 bg-accent/15 text-accent",
  warning: "border-warn/50 bg-warn/10 text-warn",
  danger: "border-warn bg-warn/20 text-warn",
  muted: "border-line bg-transparent text-ink/50",
};

export function StatusBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-secondary text-[9px] uppercase",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function loanTone(status: string): Tone {
  switch (status) {
    case "awaiting_pickup":
      return "info";
    case "active":
      return "success";
    case "return_pending":
      return "info";
    case "returned":
      return "muted";
    case "overdue":
      return "danger";
    case "disputed":
      return "warning";
    case "lost":
      return "danger";
    default:
      return "neutral";
  }
}

export function requestTone(status: string): Tone {
  switch (status) {
    case "pending":
      return "info";
    case "approved":
      return "success";
    case "declined":
      return "danger";
    case "expired":
      return "warning";
    case "cancelled":
      return "muted";
    default:
      return "neutral";
  }
}
