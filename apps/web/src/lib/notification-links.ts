import type { Notification } from "@borrowbuddy/shared";

/** Where a notification should take the student. Safe for client and server. */
export function notificationHref(notification: Pick<Notification, "payload">): string | null {
  const payload = (notification.payload ?? {}) as Record<string, unknown>;
  const loanId = payload.loan_id;
  const itemId = payload.item_id;
  if (typeof payload.campus_transfer_id === "string") return `/campus/collections/${encodeURIComponent(payload.campus_transfer_id)}`;
  if (typeof payload.campus_claim_id === "string") return "/campus/admin";
  if (typeof payload.campus_post_id === "string") return `/campus/activity`;

  if (typeof loanId === "string") return `/loans/${encodeURIComponent(loanId)}`;
  if (typeof itemId === "string") return `/items/${encodeURIComponent(itemId)}`;
  if (typeof payload.conversation_id === "string") return `/chat/${encodeURIComponent(payload.conversation_id)}`;
  return null;
}
