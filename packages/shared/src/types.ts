export type VerificationStatus = "pending" | "verified" | "rejected" | "suspended";

export type ItemCondition = "new" | "good" | "fair" | "worn";

export type ItemStatus = "draft" | "available" | "paused" | "retired";

export type AvailabilityReason = "manual" | "maintenance";

export type RequestStatus =
  | "pending"
  | "approved"
  | "declined"
  | "cancelled"
  | "expired"
  | "converted";

export type LoanStatus =
  | "awaiting_pickup"
  | "active"
  | "return_pending"
  | "returned"
  | "overdue"
  | "disputed"
  | "lost"
  | "cancelled";

export type HandoverKind = "pickup" | "return";

export type ConversationType = "private" | "community";

export type IncidentType = "damage" | "lost" | "late" | "no_show" | "other";

export type IncidentStatus = "open" | "under_review" | "resolved" | "rejected";

export type PhotoPhase = "before" | "after";

export type FineStatus = "pending" | "settled" | "waived";

export type FineSource = "overdue" | "damage" | "loss" | "no_show" | "other";

export type ReviewRole = "as_owner" | "as_borrower";

export type ReportTarget = "item" | "user" | "message";

export type ReportStatus = "open" | "resolved" | "dismissed";

export type NotificationType =
  | "campus_update"
  | "campus_message"
  | "verification_approved"
  | "verification_rejected"
  | "request_received"
  | "request_approved"
  | "request_declined"
  | "request_cancelled"
  | "request_expired"
  | "waitlist_available"
  | "loan_due_soon"
  | "loan_overdue"
  | "loan_returned"
  | "loan_cancelled"
  | "handover_confirmed"
  | "incident_opened"
  | "incident_resolved"
  | "fine_created"
  | "fine_settled"
  | "new_message"
  | "new_review"
  | "report_resolved"
  | "extension_requested"
  | "extension_approved"
  | "extension_declined"
  | "handover_reminder";

/** YYYY-MM-DD */
export type DateString = string;
/** ISO 8601 timestamp */
export type Timestamp = string;

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  department: string | null;
  year_of_study: number | null;
  avatar_path: string | null;
  student_id_path: string | null;
  verification_status: VerificationStatus;
  verification_note: string | null;
  trust_score: number;
  is_admin: boolean;
  /** Wants email for important updates (default true). */
  email_notifications?: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string;
  sort_order: number;
}

export interface PickupLocation {
  id: string;
  name: string;
  description: string | null;
  lat: number | null;
  lng: number | null;
  photo_path: string | null;
  is_active: boolean;
  /** Position on the landing campus board, % of the photo (null = not pinned) */
  xp: number | null;
  yp: number | null;
  map_label: "left" | "right";
}

export interface Item {
  id: string;
  owner_id: string;
  category_id: string;
  title: string;
  description: string;
  condition: ItemCondition;
  images: string[];
  deposit_amount: number;
  max_loan_days: number;
  pickup_location_id: string | null;
  status: ItemStatus;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface AvailabilityBlock {
  id: string;
  item_id: string;
  start_date: DateString;
  end_date: DateString;
  reason: AvailabilityReason;
  note: string | null;
  created_by: string;
  created_at: Timestamp;
}

export interface BorrowRequest {
  id: string;
  item_id: string;
  borrower_id: string;
  start_date: DateString;
  end_date: DateString;
  message: string | null;
  status: RequestStatus;
  decline_reason: string | null;
  expires_at: Timestamp | null;
  created_at: Timestamp;
  responded_at: Timestamp | null;
}

export interface Loan {
  id: string;
  request_id: string;
  item_id: string;
  owner_id: string;
  borrower_id: string;
  start_date: DateString;
  due_date: DateString;
  returned_at: Timestamp | null;
  status: LoanStatus;
  handover_token_expires_at: Timestamp | null;
  return_token_expires_at: Timestamp | null;
  handover_attempts: number;
  return_attempts: number;
  pickup_confirmed_at: Timestamp | null;
  return_confirmed_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface WaitlistEntry {
  id: string;
  item_id: string;
  user_id: string;
  desired_start: DateString;
  desired_end: DateString;
  status: "waiting" | "notified" | "converted" | "expired" | "cancelled";
  created_at: Timestamp;
}

export type GroupVisibility = "open" | "invite";

export interface Conversation {
  id: string;
  type: ConversationType;
  loan_id: string | null;
  title: string | null;
  /** Groups only (type "community"). */
  description: string | null;
  visibility: GroupVisibility;
  archived_at: Timestamp | null;
  created_by: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ConversationMember {
  conversation_id: string;
  user_id: string;
  last_read_at: Timestamp | null;
  joined_at: Timestamp;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  image_path: string | null;
  reply_to_id: string | null;
  edited_at: Timestamp | null;
  /** Set when the sender or an admin deleted it; body and image are cleared. */
  deleted_at: Timestamp | null;
  /** Emoji -> ids of the students who reacted with it. */
  reactions: Record<string, string[]>;
  created_at: Timestamp;
}

export interface Review {
  id: string;
  loan_id: string;
  reviewer_id: string;
  reviewee_id: string;
  role: ReviewRole;
  rating: number;
  comment: string | null;
  created_at: Timestamp;
}

export interface Incident {
  id: string;
  loan_id: string;
  reporter_id: string;
  type: IncidentType;
  description: string;
  status: IncidentStatus;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: Timestamp | null;
  created_at: Timestamp;
}

export interface IncidentPhoto {
  id: string;
  incident_id: string;
  path: string;
  phase: PhotoPhase;
  created_at: Timestamp;
}

export interface Fine {
  id: string;
  loan_id: string;
  user_id: string;
  amount: number;
  source: FineSource;
  reason: string;
  status: FineStatus;
  settled_by: string | null;
  settled_at: Timestamp | null;
  created_at: Timestamp;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  read_at: Timestamp | null;
  created_at: Timestamp;
}

export interface Report {
  id: string;
  reporter_id: string;
  target: ReportTarget;
  target_id: string;
  reason: string;
  status: ReportStatus;
  resolved_by: string | null;
  resolved_at: Timestamp | null;
  created_at: Timestamp;
}

export interface AuditLogEntry {
  id: number;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  created_at: Timestamp;
}

/* ------------------------------- composites ------------------------------- */

export interface ItemWithOwner extends Item {
  owner: Pick<Profile, "id" | "full_name" | "avatar_path" | "trust_score" | "verification_status">;
  category: Category;
  pickup_location: PickupLocation | null;
}

export interface LoanWithParties extends Loan {
  item: Pick<Item, "id" | "title" | "images" | "deposit_amount">;
  owner: Pick<Profile, "id" | "full_name" | "avatar_path" | "trust_score">;
  borrower: Pick<Profile, "id" | "full_name" | "avatar_path" | "trust_score">;
}

export interface AvailabilityWindow {
  start_date: DateString;
  end_date: DateString;
  kind: "loan" | "block";
}
