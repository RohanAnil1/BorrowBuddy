import {
  CAMPUS,
  DUE_SOON_HOURS,
  FINE_PER_DAY,
  HANDOVER_MAX_ATTEMPTS,
  HANDOVER_TOKEN_TTL_MINUTES,
  MAX_ACTIVE_LOANS_PER_USER,
  MAX_FINE_PER_LOAN,
  MAX_ITEM_IMAGES,
  MAX_LOAN_DAYS,
  MAX_OPEN_REQUESTS_PER_USER,
  MIN_LOAN_DAYS,
  REQUEST_EXPIRY_HOURS,
  TRUST_SCORE,
  WAITLIST_OFFER_TTL_HOURS,
} from "@borrowbuddy/shared";

/**
 * Buddy's policy brain. Every number is read from @borrowbuddy/shared, which
 * mirrors the Postgres rules, so answers can never drift from the real app.
 */
export type PolicyTopic =
  | "borrowing"
  | "fines"
  | "deposits"
  | "handover"
  | "trust"
  | "verification"
  | "waitlist"
  | "listing"
  | "incidents"
  | "lost_found"
  | "giveaways"
  | "appointments"
  | "pickup_spots"
  | "about";

export const POLICY: Record<PolicyTopic, { title: string; text: string; keywords: string[] }> = {
  about: {
    title: "What BorrowBuddy is",
    keywords: ["what is borrowbuddy", "about borrowbuddy", "borrowbuddy", "how does this work", "how it works", "what can you do"],
    text: `BorrowBuddy is a campus-only lending platform for verified ${CAMPUS.name} students. You browse what other students lend, request dates, meet at a campus pickup spot, hand over with a one-time code, and return it on time. Fines, trust scores and dispute handling keep it fair. BorrowBuddy keeps the ledger, never the money.`,
  },
  borrowing: {
    title: "How borrowing works",
    keywords: ["borrow", "request", "how long", "loan length", "days", "approve", "expire", "limit", "how many"],
    text: `Pick dates on an item's calendar and send a request. Loans run ${MIN_LOAN_DAYS}–${MAX_LOAN_DAYS} days (each item can set a lower maximum). The owner approves or declines; pending requests expire after ${REQUEST_EXPIRY_HOURS} hours. You can hold up to ${MAX_ACTIVE_LOANS_PER_USER} active loans and ${MAX_OPEN_REQUESTS_PER_USER} open requests at once. You get a reminder ${DUE_SOON_HOURS} hours before your return is due.`,
  },
  fines: {
    title: "Overdue fines",
    keywords: ["fine", "late", "overdue", "penalty", "owe", "pay", "charge"],
    text: `Returns are due on the due date. Every day late adds a ₹${FINE_PER_DAY} fine, capped at ₹${MAX_FINE_PER_LOAN} per loan. Damage, loss or no-show incidents can add fines after an admin review. Fines are settled or waived by a campus admin; your Fines page shows the running total.`,
  },
  deposits: {
    title: "Deposits",
    keywords: ["deposit", "refund", "money", "security"],
    text: `Owners can ask for a refundable deposit, shown on each listing. Deposits are exchanged in person and tracked offline. BorrowBuddy records them but never holds money. A damage or loss fine may be drawn from the deposit.`,
  },
  handover: {
    title: "Pickup and return handovers",
    keywords: ["handover", "pickup", "pick up", "code", "qr", "return", "collect", "otp"],
    text: `At pickup and at return, one person shows a QR / six-digit code and the other confirms it. Codes are single-use, expire after ${HANDOVER_TOKEN_TTL_MINUTES} minutes, and lock after ${HANDOVER_MAX_ATTEMPTS} wrong attempts (just generate a fresh one). Confirming the code moves the loan forward and records custody. Buddy never shows or asks for codes.`,
  },
  trust: {
    title: "Trust score",
    keywords: ["trust", "score", "reputation", "rating", "review", "stars"],
    text: `Everyone starts near ${TRUST_SCORE.base} (range ${TRUST_SCORE.min}–${TRUST_SCORE.max}). Good reviews raise it, returning on time (target ${Math.round(TRUST_SCORE.onTimeTarget * 100)}%+) raises it, each completed loan adds ${TRUST_SCORE.completedLoanBonusPerLoan} (up to +${TRUST_SCORE.maxCompletedLoanBonus}), verified students get +${TRUST_SCORE.verifiedBonus}, and each upheld incident costs ${TRUST_SCORE.incidentPenalty} points. Reviews happen after a loan ends.`,
  },
  verification: {
    title: "Student verification",
    keywords: ["verify", "verification", "student id", "pending", "approved", "rejected", "suspended", "sign up", "account"],
    text: `Only ${CAMPUS.name} students can join, using an @${CAMPUS.emailDomain} email. After onboarding you upload your student ID; a campus admin reviews it and your account unlocks once verified. If it's rejected you can resubmit from the pending page.`,
  },
  waitlist: {
    title: "Waitlists",
    keywords: ["waitlist", "wait list", "queue", "busy", "unavailable", "booked"],
    text: `If an item is booked for your dates, join its waitlist from the item page. When it frees up you get an offer that stays open for ${WAITLIST_OFFER_TTL_HOURS} hours before it moves to the next person.`,
  },
  listing: {
    title: "Lending your own stuff",
    keywords: ["lend", "list", "listing", "my item", "add item", "post", "sell", "owner"],
    text: `Use "List an item" from My items. Add up to ${MAX_ITEM_IMAGES} photos, condition, deposit, maximum loan days and a pickup spot. You approve or decline each request, can pause a listing anytime, and can block dates on its calendar.`,
  },
  incidents: {
    title: "Damage, loss and disputes",
    keywords: ["damage", "broken", "lost item", "dispute", "incident", "report", "no show", "no-show"],
    text: `If something goes wrong, open an incident from the loan page (damage, lost, late, no-show or other) with photos and a description. A campus admin reviews it, may issue a fine, and the outcome can affect trust scores.`,
  },
  lost_found: {
    title: "Campus Lost & Found",
    keywords: ["lost and found", "lost & found", "found", "claim", "lost my"],
    text: `Finders post photos, a rough location and date, plus private identifying notes. To claim, you submit private evidence that only you and admins can see. An admin approves one claim, which opens a private collection chat; you collect with a one-time code and get a receipt.`,
  },
  giveaways: {
    title: "Semester Giveaway Shelf",
    keywords: ["giveaway", "free", "give away", "reserve", "reservation", "semester"],
    text: `Students list free items or bundles. The first request reserves it for 24, 48 or 72 hours (default 48). Collect before the deadline with a one-time code; if the hold expires the item goes back on the shelf. Giveaways don't affect fines, deposits or trust.`,
  },
  appointments: {
    title: "Handover appointments",
    keywords: ["appointment", "schedule", "slot", "time", "availability", "meet", "when"],
    text: `You can set weekly hours (and date overrides) and book 15, 30 or 60-minute handover slots up to 30 days ahead, in campus time (IST). Bookings block both people's calendars to avoid clashes. Appointments are optional; codes work without one.`,
  },
  pickup_spots: {
    title: "Pickup spots",
    keywords: ["where", "spot", "location", "map", "meet", "pickup point", "place"],
    text: `Handovers happen at public campus spots shown on the Map, such as Maggi Hotspot (Block C1), Southern Stories (Block D1), D5 Stage, the Laundry between D4 and D2, and Quench by the Sports Complex. Each listing names its spot.`,
  },
};

export function policyText(topic: PolicyTopic): string {
  const entry = POLICY[topic];
  return `${entry.title}: ${entry.text}`;
}

export function fullPolicyBrief(): string {
  return (Object.keys(POLICY) as PolicyTopic[]).map((topic) => `- ${policyText(topic)}`).join("\n");
}

/** Best keyword match for the local brain. Returns null when nothing fits. */
export function matchPolicy(message: string): PolicyTopic | null {
  const text = message.toLowerCase();
  let best: { topic: PolicyTopic; score: number } | null = null;
  for (const topic of Object.keys(POLICY) as PolicyTopic[]) {
    const score = POLICY[topic].keywords.reduce(
      (sum, keyword) => (text.includes(keyword) ? sum + keyword.length : sum),
      0,
    );
    if (score > 0 && (!best || score > best.score)) best = { topic, score };
  }
  return best?.topic ?? null;
}

/** Today's campus date (Asia/Kolkata), so "next weekend" resolves correctly. */
export function campusToday(): { iso: string; weekday: string } {
  const now = new Date();
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
  const weekday = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long" }).format(now);
  return { iso, weekday };
}
