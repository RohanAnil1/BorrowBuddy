import type {
  FineStatus,
  ItemStatus,
  IncidentType,
  ItemCondition,
  LoanStatus,
  NotificationType,
  RequestStatus,
  VerificationStatus,
} from "./types";

export const APP_NAME = "BorrowBuddy";

export const CAMPUS = {
  name: "Bennett University",
  emailDomain: "bennett.edu.in",
} as const;

/* --------------------------------- limits --------------------------------- */

export const MAX_ITEM_IMAGES = 6;
export const MAX_IMAGE_SIZE_MB = 5;
export const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
/** Student-ID upload guardrails (mirrored by the submit_student_id() RPC). */
export const STUDENT_ID_ALLOWED_TYPES = ["image/png", "image/jpeg"] as const;
export const STUDENT_ID_MIN_BYTES = 50 * 1024;
export const MIN_LOAN_DAYS = 1;
export const MAX_LOAN_DAYS = 30;
/** Mirrors the check inside approve_request(). */
export const MAX_ACTIVE_LOANS_PER_USER = 5;
/** App-level guard; the UI blocks more open requests. */
export const MAX_OPEN_REQUESTS_PER_USER = 10;

/* --------------------------------- timing --------------------------------- */

/** Pending borrow requests auto-expire after this many hours (DB trigger + cron). */
export const REQUEST_EXPIRY_HOURS = 48;
/** Hours after the due date before a loan is flagged overdue. */
export const OVERDUE_GRACE_HOURS = 0;
/** Reminder is sent this many hours before the due date. */
export const DUE_SOON_HOURS = 24;
/** Handover/return QR tokens are single-use and expire quickly. */
export const HANDOVER_TOKEN_TTL_MINUTES = 15;
/** Max wrong-code attempts before a handover code must be regenerated. */
export const HANDOVER_MAX_ATTEMPTS = 5;
/** Waitlist offers stay actionable for this long. */
export const WAITLIST_OFFER_TTL_HOURS = 12;

/* ---------------------------------- fines --------------------------------- */

/** INR per day past the due date (mirrors flag_overdue_loans()). */
export const FINE_PER_DAY = 20;
/** Cap per loan (mirrors flag_overdue_loans()). */
export const MAX_FINE_PER_LOAN = 1000;
/** Deposit is refundable; a damage/loss fine may draw from it (tracked offline). */
export const FINE_CURRENCY = "INR";

/* ------------------------------- trust score ------------------------------- */

/** Mirrors public.recompute_trust_score() in Postgres — the DB is authoritative. */
export const TRUST_SCORE = {
  base: 70,
  min: 0,
  max: 100,
  defaultRating: 3.5,
  ratingMultiplier: 8,
  onTimeTarget: 0.8,
  onTimeMultiplier: 20,
  completedLoanBonusPerLoan: 0.5,
  maxCompletedLoanBonus: 10,
  verifiedBonus: 5,
  incidentPenalty: 8,
} as const;

/* ------------------------------ loan lifecycle ----------------------------- */

export const LOAN_STATUS_TRANSITIONS: Record<LoanStatus, readonly LoanStatus[]> = {
  awaiting_pickup: ["active", "cancelled", "disputed"],
  active: ["return_pending", "returned", "overdue", "disputed", "lost"],
  return_pending: ["returned", "overdue", "disputed", "lost"],
  overdue: ["return_pending", "returned", "disputed", "lost"],
  returned: [],
  disputed: ["returned", "lost", "cancelled"],
  lost: [],
  cancelled: [],
};

export function canTransitionLoan(from: LoanStatus, to: LoanStatus): boolean {
  return LOAN_STATUS_TRANSITIONS[from].includes(to);
}

export const ACTIVE_LOAN_STATUSES: readonly LoanStatus[] = [
  "awaiting_pickup",
  "active",
  "return_pending",
  "overdue",
  "disputed",
];

/** Loan statuses that occupy an item's calendar and block double-booking.
 *  Mirrors the loans_no_overlap exclusion constraint in Postgres. */
export const BLOCKING_LOAN_STATUSES: readonly LoanStatus[] = [
  "awaiting_pickup",
  "active",
  "return_pending",
  "overdue",
  "disputed",
  "lost",
];

/* ---------------------------------- labels --------------------------------- */

export const ITEM_CONDITION_LABELS: Record<ItemCondition, string> = {
  new: "Like new",
  good: "Good",
  fair: "Fair",
  worn: "Worn",
};

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  pending: "Pending review",
  verified: "Verified student",
  rejected: "Rejected",
  suspended: "Suspended",
};

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  damage: "Item damaged",
  lost: "Item lost",
  late: "Returned late",
  no_show: "No-show at pickup",
  other: "Other",
};

export const LOAN_STATUS_LABELS: Record<LoanStatus, string> = {
  awaiting_pickup: "Awaiting pickup",
  active: "Borrowed",
  return_pending: "Return in progress",
  returned: "Returned",
  overdue: "Overdue",
  disputed: "Under dispute",
  lost: "Reported lost",
  cancelled: "Cancelled",
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  declined: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
  converted: "Approved",
};

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  draft: "Draft",
  available: "Available",
  paused: "Paused",
  retired: "Retired",
};

export const FINE_STATUS_LABELS: Record<FineStatus, string> = {
  pending: "Unpaid",
  settled: "Settled",
  waived: "Waived",
};

export const WAITLIST_STATUS_LABELS = {
  waiting: "Waiting",
  notified: "Your turn",
  converted: "Requested",
  expired: "Expired",
  cancelled: "Cancelled",
} as const;

export const NOTIFICATION_TYPES: readonly NotificationType[] = [
  "campus_update",
  "campus_message",
  "verification_approved",
  "verification_rejected",
  "request_received",
  "request_approved",
  "request_declined",
  "request_cancelled",
  "request_expired",
  "waitlist_available",
  "loan_due_soon",
  "loan_overdue",
  "loan_returned",
  "loan_cancelled",
  "handover_confirmed",
  "incident_opened",
  "incident_resolved",
  "fine_created",
  "fine_settled",
  "new_message",
  "new_review",
  "report_resolved",
];

/* ------------------------------ storage paths ------------------------------ */

export const STORAGE_BUCKETS = {
  itemImages: "item-images",
  avatars: "avatars",
  studentIds: "student-ids",
  incidentPhotos: "incident-photos",
  chatImages: "chat-images",
} as const;
