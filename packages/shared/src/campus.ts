import { z } from "zod";

export type CampusKind = "found" | "giveaway";
export interface CampusPost {
  id: string;
  owner_id: string;
  kind: CampusKind;
  title: string;
  description: string;
  category_id: string;
  location: string;
  pickup_location_id: string | null;
  found_on: string | null;
  condition: string | null;
  hold_hours: number;
  images: string[];
  status: "open" | "reserved" | "completed" | "hidden";
  created_at: string;
  updated_at: string;
}
export interface OwnershipClaim {
  id: string;
  post_id: string;
  claimant_id: string;
  evidence: string;
  status: "pending" | "approved" | "rejected" | "withdrawn" | "closed";
  decision_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}
export interface CollectionTransfer {
  id: string;
  post_id: string;
  claim_id: string | null;
  host_id: string;
  recipient_id: string;
  status: "active" | "completed" | "cancelled" | "expired";
  expires_at: string | null;
  completed_at: string | null;
  closed_reason: string | null;
  created_at: string;
  host_read_at: string;
  recipient_read_at: string;
}
export type GiveawayReservation = CollectionTransfer & { expires_at: string };
export interface ExchangeMessage {
  id: string;
  transfer_id: string;
  sender_id: string;
  client_id: string;
  body: string;
  created_at: string;
}
export interface ScheduleWindow {
  day?: number;
  date?: string;
  blocked?: boolean;
  start?: string;
  end?: string;
}
export interface HandoverSchedule {
  host_id: string;
  pickup_location_id: string;
  slot_minutes: number;
  weekly: ScheduleWindow[];
  exceptions: ScheduleWindow[];
}
export interface HandoverSlot {
  starts_at: string;
  ends_at: string;
  pickup_location_id: string;
}
export interface HandoverAppointment extends HandoverSlot {
  id: string;
  host_id: string;
  recipient_id: string;
  loan_id: string | null;
  transfer_id: string | null;
  kind: "pickup" | "return" | "collection";
  status: "booked" | "cancelled" | "completed";
}
export const CAMPUS_TIMEZONE = "Asia/Kolkata";
export const campusPostSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(["found", "giveaway"]),
    title: z.string().trim().min(3).max(100),
    description: z.string().trim().min(10).max(2000),
    category_id: z.uuid(),
    location: z.string().trim().min(2).max(100),
    pickup_location_id: z.uuid().nullable(),
    found_on: z.iso.date().nullable(),
    condition: z.enum(["new", "good", "fair", "worn"]).nullable(),
    hold_hours: z.union([z.literal(24), z.literal(48), z.literal(72)]),
    images: z.array(z.string().min(1)).min(1, "Add at least one photo").max(6),
    identifying_notes: z.string().trim().max(2000).default(""),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "found" && (!v.found_on || v.identifying_notes.length < 5))
      ctx.addIssue({
        code: "custom",
        path: ["identifying_notes"],
        message: "Add the found date and private identifying notes.",
      });
    if (v.kind === "giveaway" && !v.condition)
      ctx.addIssue({
        code: "custom",
        path: ["condition"],
        message: "Choose the condition.",
      });
  });
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
