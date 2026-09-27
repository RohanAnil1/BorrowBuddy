import type { Item, WaitlistEntry } from "@borrowbuddy/shared";
import { createClient } from "@/lib/supabase/server";

export type WaitlistWithItem = WaitlistEntry & {
  item: Pick<Item, "id" | "title" | "images"> | null;
};

export async function getWaitlistForUser(userId: string): Promise<WaitlistWithItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("waitlist_entries")
    .select("*, item:items!waitlist_entries_item_id_fkey(id, title, images)")
    .eq("user_id", userId)
    .in("status", ["waiting", "notified"])
    .order("created_at", { ascending: false });

  return (data as WaitlistWithItem[] | null) ?? [];
}

export async function getWaitlistCountForItem(itemId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("waitlist_entries")
    .select("id", { count: "exact", head: true })
    .eq("item_id", itemId)
    .in("status", ["waiting", "notified"]);

  return count ?? 0;
}
