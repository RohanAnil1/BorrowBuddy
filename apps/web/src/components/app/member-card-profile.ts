import type { Profile } from "@borrowbuddy/shared";

export type MemberCardProfile = Pick<Profile, "id" | "full_name" | "department" | "year_of_study" | "is_admin" | "verification_status" | "trust_score" | "created_at">;
export const memberCode = (id: string) => `BB-${id.replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase()}`;

/** Keep private account fields out of the public card's serialized client props. */
export function toMemberCardProfile(profile: MemberCardProfile): MemberCardProfile {
  return { id: profile.id, full_name: profile.full_name, department: profile.department,
    year_of_study: profile.year_of_study, is_admin: profile.is_admin,
    verification_status: profile.verification_status, trust_score: profile.trust_score,
    created_at: profile.created_at };
}
