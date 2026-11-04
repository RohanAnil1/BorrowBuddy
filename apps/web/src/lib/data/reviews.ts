import type { Profile, Review } from "@borrowbuddy/shared";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type ReviewWithReviewer = Review & {
  reviewer: Pick<Profile, "id" | "full_name" | "avatar_path"> | null;
};

const getPublicProfileStats = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_profile_stats", { p_profile_id: userId });
  if (error) throw new Error(error.message);
  const row = (data as { completed_loans: number; review_count: number; rating_average: number | null }[] | null)?.[0];
  if (!row) throw new Error("Student reputation is unavailable.");
  return row;
});

export async function getReviewsForUser(userId: string, limit = 20): Promise<ReviewWithReviewer[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select("*, reviewer:profiles!reviews_reviewer_id_fkey(id, full_name, avatar_path)")
    .eq("reviewee_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data as ReviewWithReviewer[] | null) ?? [];
}

export async function getReviewsForLoan(loanId: string): Promise<Review[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("reviews").select("*").eq("loan_id", loanId);
  return (data as Review[] | null) ?? [];
}

export async function getRatingSummary(
  userId: string,
): Promise<{ average: number | null; count: number }> {
  const stats = await getPublicProfileStats(userId);
  return { average: stats.rating_average, count: stats.review_count };
}

export async function getCompletedLoanCount(userId: string): Promise<number> {
  return (await getPublicProfileStats(userId)).completed_loans;
}
