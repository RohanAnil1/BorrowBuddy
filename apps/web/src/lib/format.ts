import {
  FINE_CURRENCY,
  FINE_STATUS_LABELS,
  ITEM_CONDITION_LABELS,
  ITEM_STATUS_LABELS,
  WAITLIST_STATUS_LABELS,
  type FineStatus,
  type ItemStatus,
  LOAN_STATUS_LABELS,
  REQUEST_STATUS_LABELS,
  type ItemCondition,
  type LoanStatus,
  type RequestStatus,
} from "@borrowbuddy/shared";

export function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(`${value}T00:00:00Z`) : value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatDateRange(start: string, end: string): string {
  if (start === end) return formatDate(start);
  return `${formatDate(start)} - ${formatDate(end)}`;
}

/** Any rupee amount: fines, totals, deposits. ₹0 stays "₹0". */
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: FINE_CURRENCY,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** A deposit value on its own ("No deposit" when the owner asks for none). */
export function formatDeposit(amount: number): string {
  return amount > 0 ? formatMoney(amount) : "No deposit";
}

/** A compact deposit tag for cards: "DEP ₹400" or "No deposit". */
export function depositTag(amount: number): string {
  return amount > 0 ? `DEP ${formatMoney(amount)}` : "No deposit";
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(iso));
}

export function conditionLabel(condition: ItemCondition): string {
  return ITEM_CONDITION_LABELS[condition];
}

export function loanStatusLabel(status: LoanStatus): string {
  return LOAN_STATUS_LABELS[status];
}

export function requestStatusLabel(status: RequestStatus): string {
  return REQUEST_STATUS_LABELS[status];
}

export function itemStatusLabel(status: ItemStatus): string {
  return ITEM_STATUS_LABELS[status];
}

export function fineStatusLabel(status: FineStatus): string {
  return FINE_STATUS_LABELS[status];
}

export function waitlistStatusLabel(status: keyof typeof WAITLIST_STATUS_LABELS): string {
  return WAITLIST_STATUS_LABELS[status];
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
