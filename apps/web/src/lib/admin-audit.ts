/** Plain-English names for audit log actions, shared by the console pages. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "verification.verified": "Verified a student",
  "verification.rejected": "Rejected a verification",
  "verification.suspended": "Suspended a student",
  "verification.pending": "Moved a student to pending",
  "verification.revoked": "Revoked a verification",
  "admin.granted": "Granted admin access",
  "admin.revoked": "Removed admin access",
  "profile.edited": "Edited a student's details",
  "profile.deleted": "Deleted a student's profile",
  "profile.student_id_submitted": "Student ID submitted",
  "trust.set": "Set a trust score",
  "trust.recalculated": "Recalculated a trust score",
  "notice.sent": "Sent a notice",
  "listings.paused": "Paused a student's listings",
  "avatar.removed": "Removed a profile photo",
  "fine.settled": "Marked a fine settled",
  "fine.waived": "Waived a fine",
  "incident.opened": "Incident reported",
  "incident.resolved": "Resolved an incident",
  "incident.rejected": "Rejected an incident",
  "report.resolved": "Resolved a report",
  "report.dismissed": "Dismissed a report",
  "group.created": "Created a group",
  "group.updated": "Updated a group",
  "group.deleted": "Deleted a group",
  "group.member_added": "Added a group member",
  "group.member_removed": "Removed a group member",
  "conversation.created": "Created a channel",
  "message.deleted": "Deleted a message",
  "pickup_location.saved": "Saved a pickup spot",
  "pickup_location.deleted": "Removed a pickup spot",
  "request.approved": "Request approved",
  "request.declined": "Request declined",
  "request.cancelled": "Request cancelled",
  "loan.cancelled": "Loan cancelled",
  "campus.post.saved": "Campus post saved",
  "campus.post.hidden": "Campus post hidden",
  "campus.claim.submitted": "Ownership claim submitted",
  "campus.giveaway.reserved": "Giveaway reserved",
  "campus.collection.completed": "Collection completed",
  "campus.appointment.booked": "Collection booked",
};

/** Filter categories: the part of the action name before the first dot. */
export const AUDIT_CATEGORIES: { key: string; label: string }[] = [
  { key: "verification", label: "Verification" },
  { key: "admin", label: "Admin access" },
  { key: "profile", label: "Profiles" },
  { key: "trust", label: "Trust" },
  { key: "notice", label: "Notices" },
  { key: "fine", label: "Fines" },
  { key: "incident", label: "Incidents" },
  { key: "report", label: "Reports" },
  { key: "group", label: "Groups" },
  { key: "message", label: "Messages" },
  { key: "pickup_location", label: "Pickup spots" },
  { key: "request", label: "Requests" },
  { key: "loan", label: "Loans" },
  { key: "campus", label: "Campus" },
];

export function auditLabel(action: string): string {
  if (AUDIT_ACTION_LABELS[action]) return AUDIT_ACTION_LABELS[action];
  const words = action.replace(/[._]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The one detail worth showing inline: a reason, note, title or name. */
export function auditNote(metadata: Record<string, unknown>, subject?: string | null): string | null {
  for (const key of ["note", "reason", "title", "resolution_note", "name"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim() && value.trim() !== subject) return value.trim();
  }
  return null;
}

/** Where an audit row's subject lives in the console, if anywhere. */
export function auditHref(entity: string, entityId: string): string | null {
  if (!/^[0-9a-f-]{36}$/i.test(entityId)) return null;
  switch (entity) {
    case "profile":
      return `/admin/students/${entityId}`;
    case "conversation":
      return `/admin/groups/${entityId}`;
    case "loan":
      return `/loans/${entityId}`;
    default:
      return null;
  }
}
