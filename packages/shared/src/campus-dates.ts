/** Campus wall-clock helpers. Kept free of zod so client code stays light. */

export const CAMPUS_TIMEZONE = "Asia/Kolkata";

export function campusDate(value: string | Date, includeTime = true): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: CAMPUS_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

export function campusToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CAMPUS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
