import { createClient } from "@/lib/supabase/server";

export type ImpactCategory = { slug: string; name: string; loans: number; days: number; saved: number };

export type ImpactStats = {
  scope: "campus" | "me";
  completed_loans: number;
  borrow_days: number;
  money_saved: number;
  deposits_returned: number;
  items_shared: number;
  lenders: number;
  borrowers: number;
  borrowed_loans: number;
  borrowed_saved: number;
  borrowed_days: number;
  lent_loans: number;
  lent_saved: number;
  students_helped: number;
  rehomed: number;
  listed_items: number;
  categories: ImpactCategory[];
};

/** Aggregate sharing impact for the campus or the signed-in student. Null if unavailable. */
export async function getImpactStats(scope: "campus" | "me"): Promise<ImpactStats | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_impact_stats", { p_scope: scope });
  if (error || !data) return null;
  return data as ImpactStats;
}

/** Daily values behind the "estimated money saved" figure, for the footnote. */
export async function getImpactRates(): Promise<{ name: string; daily_value: number }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("impact_category_rates")
    .select("daily_value, category:categories (name, sort_order)");
  if (error || !data) return [];
  return (data as unknown as { daily_value: number; category: { name: string; sort_order: number } | null }[])
    .filter((row) => row.category)
    .sort((a, b) => a.category!.sort_order - b.category!.sort_order)
    .map((row) => ({ name: row.category!.name, daily_value: row.daily_value }));
}
