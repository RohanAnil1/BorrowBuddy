import type { DateString } from "./types";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(value: string): boolean {
  if (!DATE_REGEX.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function parseDateString(value: DateString): Date {
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatDateString(date: Date): DateString {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayString(): DateString {
  return formatDateString(new Date());
}

export function addDays(value: DateString, days: number): DateString {
  const date = parseDateString(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateString(date);
}

/** Inclusive of both endpoints. */
export function daysBetween(start: DateString, end: DateString): number {
  const ms = parseDateString(end).getTime() - parseDateString(start).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/** Inclusive of both endpoints. */
export function eachDateInRange(start: DateString, end: DateString): DateString[] {
  const dates: DateString[] = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

/** Inclusive overlap check — matches the Postgres daterange '[]' constraint. */
export function rangesOverlap(
  aStart: DateString,
  aEnd: DateString,
  bStart: DateString,
  bEnd: DateString,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function isPast(value: DateString): boolean {
  return value < todayString();
}
