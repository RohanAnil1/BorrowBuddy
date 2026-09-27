import type { Profile, Review } from "@borrowbuddy/shared";
import { createClient } from "@/lib/supabase/server";

export type ReviewWithReviewer = Review & {
  reviewer: Pick<Profile, "id" | "full_name" | "avatar_path"> | null;
};

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
  const supabase = await createClient();
  const { data } = await supabase.from("reviews").select("rating").eq("reviewee_id", userId);
  const ratings = ((data as { rating: number }[] | null) ?? []).map((row) => row.rating);

  if (ratings.length === 0) return { average: null, count: 0 };
  return {
    average: ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length,
    count: ratings.length,
  };
}

export async function getCompletedLoanCount(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("loans")
    .select("id", { count: "exact", head: true })
    .or(`owner_id.eq.${userId},borrower_id.eq.${userId}`)
    .eq("status", "returned");

  return count ?? 0;
}
