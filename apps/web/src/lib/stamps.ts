/** Member ID card achievement stamps. Order matches `get_profile_stamps`. */
export const STAMP_KEYS = [
  "first_lend",
  "first_borrow",
  "on_time_10",
  "trusted_lender",
  "five_star_streak",
  "campus_helper",
] as const;

export type StampKey = (typeof STAMP_KEYS)[number];

export type ProfileStamp = { key: StampKey; earned: boolean; progress: number; goal: number };

type StampDesign = {
  /** Ink label pressed into the stamp. */
  label: string;
  /** Small mono rim text. */
  rim: string;
  /** One-line "how to earn" hint shown on locked stamps. */
  hint: string;
  shape: "round" | "box";
  /** Resting tilt in degrees, like a hand-pressed stamp. */
  tilt: number;
};

export const STAMP_DESIGNS: Record<StampKey, StampDesign> = {
  first_lend: { label: "First lend", rim: "LENT", hint: "Lend an item and get it back.", shape: "round", tilt: -9 },
  first_borrow: { label: "First borrow", rim: "BORROWED", hint: "Borrow an item and return it.", shape: "round", tilt: 6 },
  on_time_10: { label: "On time ×10", rim: "RETURNS", hint: "Return 10 loans by their due date.", shape: "box", tilt: -4 },
  trusted_lender: { label: "Trusted lender", rim: "TRUST 85+", hint: "Finish 5 lends with a trust score of 85+.", shape: "round", tilt: 8 },
  five_star_streak: { label: "5★ streak", rim: "REVIEWS", hint: "Get five 5-star reviews in a row.", shape: "box", tilt: 5 },
  campus_helper: { label: "Campus helper", rim: "LOST & FOUND", hint: "Hand over a found item or a giveaway.", shape: "round", tilt: -6 },
};

const isStampKey = (value: unknown): value is StampKey => STAMP_KEYS.includes(value as StampKey);

/** Normalise RPC rows: drop unknown keys from newer schemas, keep catalog order. */
export function toProfileStamps(rows: unknown): ProfileStamp[] {
  if (!Array.isArray(rows)) return [];
  const byKey = new Map<StampKey, ProfileStamp>();
  for (const row of rows as Record<string, unknown>[]) {
    if (!row || !isStampKey(row.key)) continue;
    const goal = Math.max(1, Number(row.goal) || 1);
    byKey.set(row.key, {
      key: row.key,
      earned: row.earned === true,
      goal,
      progress: Math.min(goal, Math.max(0, Number(row.progress) || 0)),
    });
  }
  return STAMP_KEYS.flatMap((key) => byKey.get(key) ?? []);
}
