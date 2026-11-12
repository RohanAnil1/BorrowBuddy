import type { ItemWithOwner } from "@borrowbuddy/shared";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { ITEM_SELECT } from "./items";

/**
 * Ids of the items this student saved; cached per request so cards can share
 * it. Null when saving is unavailable (e.g. the table isn't migrated yet), so
 * callers hide the heart instead of offering a toggle that would fail.
 */
export const getSavedItemIds = cache(async (userId: string): Promise<Set<string> | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("wishlist_items").select("item_id").eq("user_id", userId);
  // A missing table (migration not applied yet) should hide hearts, not break browsing.
  if (error) return null;
  return new Set(((data as { item_id: string }[] | null) ?? []).map((row) => row.item_id));
});

/** Saved items, most recently saved first. Items the student can no longer see drop out. */
export async function getSavedItems(userId: string): Promise<ItemWithOwner[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wishlist_items")
    .select(`created_at, item:items (${ITEM_SELECT})`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Saved items failed to load: ${error.message}`);
  return ((data as unknown as { item: ItemWithOwner | null }[] | null) ?? [])
    .map((row) => row.item)
    .filter((item): item is ItemWithOwner => item !== null);
}

/** The `saved` prop for an ItemCard: undefined hides the heart. */
export function savedState(savedIds: Set<string> | null, itemId: string): boolean | undefined {
  return savedIds ? savedIds.has(itemId) : undefined;
}
