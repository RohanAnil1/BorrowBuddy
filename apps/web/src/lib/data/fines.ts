import type { Fine, Profile } from "@borrowbuddy/shared";
import { createClient } from "@/lib/supabase/server";

export type FineWithContext = Fine & {
  loan?: { id: string; item_title: string | null } | null;
  user?: Pick<Profile, "id" | "full_name"> | null;
};

export async function getFinesForUser(userId: string): Promise<FineWithContext[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fines")
    .select("*, loan:loans(id, item:items(title))")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return ((data as unknown as (Fine & { loan: { id: string; item: { title: string } | null } | null })[] | null) ?? []).map(
    (row) => ({
      ...row,
      loan: row.loan ? { id: row.loan.id, item_title: row.loan.item?.title ?? null } : null,
    }),
  );
}

export async function getPendingFines(limit = 50): Promise<FineWithContext[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fines")
    .select("*, user:profiles!fines_user_id_fkey(id, full_name), loan:loans(id, item:items(title))")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  return ((data as unknown as (Fine & {
    user: Pick<Profile, "id" | "full_name"> | null;
    loan: { id: string; item: { title: string } | null } | null;
  })[] | null) ?? []).map((row) => ({
    ...row,
    loan: row.loan ? { id: row.loan.id, item_title: row.loan.item?.title ?? null } : null,
  }));
}

export async function getOutstandingTotal(userId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fines")
    .select("amount")
    .eq("user_id", userId)
    .eq("status", "pending");

  return ((data as { amount: number }[] | null) ?? []).reduce((sum, row) => sum + row.amount, 0);
}
