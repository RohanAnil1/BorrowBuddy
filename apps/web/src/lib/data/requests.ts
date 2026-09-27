import type { BorrowRequest, Item, Profile } from "@borrowbuddy/shared";
import { createClient } from "@/lib/supabase/server";

export type IncomingRequest = BorrowRequest & {
  item: Pick<Item, "id" | "title" | "images" | "deposit_amount">;
  borrower: Pick<Profile, "id" | "full_name" | "avatar_path" | "trust_score">;
};

export type OutgoingRequest = BorrowRequest & {
  item: Pick<Item, "id" | "title" | "images" | "deposit_amount" | "max_loan_days">;
  owner: Pick<Profile, "id" | "full_name" | "avatar_path" | "trust_score">;
};

const REQUEST_SELECT = `
  *,
  item:items!borrow_requests_item_id_fkey (id, title, images, deposit_amount),
  borrower:profiles!borrow_requests_borrower_id_fkey (id, full_name, avatar_path, trust_score)
`;

export async function getIncomingRequests(ownerId: string): Promise<IncomingRequest[]> {
  const supabase = await createClient();

  const { data: ownedItems } = await supabase.from("items").select("id").eq("owner_id", ownerId);
  const itemIds = ((ownedItems as { id: string }[] | null) ?? []).map((item) => item.id);

  if (itemIds.length === 0) return [];

  const { data } = await supabase
    .from("borrow_requests")
    .select(REQUEST_SELECT)
    .in("item_id", itemIds)
    .order("created_at", { ascending: false })
    .limit(60);

  return (data as IncomingRequest[] | null) ?? [];
}

export async function getOutgoingRequests(borrowerId: string): Promise<OutgoingRequest[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("borrow_requests")
    .select(REQUEST_SELECT)
    .eq("borrower_id", borrowerId)
    .order("created_at", { ascending: false })
    .limit(60);

  return (data as OutgoingRequest[] | null) ?? [];
}

export async function getPendingRequestCount(ownerId: string): Promise<number> {
  const supabase = await createClient();
  const { data: ownedItems } = await supabase.from("items").select("id").eq("owner_id", ownerId);
  const itemIds = ((ownedItems as { id: string }[] | null) ?? []).map((item) => item.id);
  if (itemIds.length === 0) return 0;

  const { count } = await supabase
    .from("borrow_requests")
    .select("id", { count: "exact", head: true })
    .in("item_id", itemIds)
    .eq("status", "pending");

  return count ?? 0;
}
