import type {
  AvailabilityWindow,
  Category,
  Item,
  ItemCondition,
  ItemWithOwner,
  PickupLocation,
} from "@borrowbuddy/shared";
import { BLOCKING_LOAN_STATUSES } from "@borrowbuddy/shared";
import { createClient } from "@/lib/supabase/server";

const ITEM_SELECT = `
  *,
  owner:profiles!items_owner_id_fkey (id, full_name, avatar_path, trust_score, verification_status),
  category:categories (*),
  pickup_location:pickup_locations (*)
`;

export type ItemSearchFilters = {
  q?: string;
  categoryId?: string;
  condition?: ItemCondition;
  pickupLocationId?: string;
  startDate?: string;
  endDate?: string;
  ownerId?: string;
  limit?: number;
};

export async function searchItems(filters: ItemSearchFilters): Promise<ItemWithOwner[]> {
  const supabase = await createClient();
  const limit = filters.limit ?? 48;

  let excludedIds: string[] = [];

  if (filters.startDate && filters.endDate) {
    const [busyLoans, blocked] = await Promise.all([
      supabase
        .from("loans")
        .select("item_id")
        .in("status", [...BLOCKING_LOAN_STATUSES])
        .lte("start_date", filters.endDate)
        .gte("due_date", filters.startDate),
      supabase
        .from("availability_blocks")
        .select("item_id")
        .lte("start_date", filters.endDate)
        .gte("end_date", filters.startDate),
    ]);

    const ids = new Set<string>();
    for (const row of (busyLoans.data as { item_id: string }[] | null) ?? []) ids.add(row.item_id);
    for (const row of (blocked.data as { item_id: string }[] | null) ?? []) ids.add(row.item_id);
    excludedIds = [...ids];
  }

  let query = supabase
    .from("items")
    .select(ITEM_SELECT)
    .eq("status", "available")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.ownerId) query = query.eq("owner_id", filters.ownerId);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.condition) query = query.eq("condition", filters.condition);
  if (filters.pickupLocationId) query = query.eq("pickup_location_id", filters.pickupLocationId);
  if (filters.q) {
    const term = filters.q.replace(/[%,]/g, " ").trim();
    if (term) query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
  }
  if (excludedIds.length > 0) {
    query = query.not("id", "in", `(${excludedIds.join(",")})`);
  }

  const { data } = await query;
  return (data as ItemWithOwner[] | null) ?? [];
}

export async function getItem(id: string): Promise<ItemWithOwner | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("items").select(ITEM_SELECT).eq("id", id).maybeSingle();
  return (data as ItemWithOwner | null) ?? null;
}

export async function getMyItems(ownerId: string): Promise<ItemWithOwner[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("items")
    .select(ITEM_SELECT)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });

  return (data as ItemWithOwner[] | null) ?? [];
}

export async function getItemAvailability(itemId: string): Promise<AvailabilityWindow[]> {
  const supabase = await createClient();

  const [loans, blocks] = await Promise.all([
    supabase
      .from("loans")
      .select("start_date, due_date")
      .eq("item_id", itemId)
      .in("status", [...BLOCKING_LOAN_STATUSES]),
    supabase
      .from("availability_blocks")
      .select("start_date, end_date")
      .eq("item_id", itemId),
  ]);

  const windows: AvailabilityWindow[] = [];

  for (const loan of (loans.data as { start_date: string; due_date: string }[] | null) ?? []) {
    windows.push({ start_date: loan.start_date, end_date: loan.due_date, kind: "loan" });
  }
  for (const block of (blocks.data as { start_date: string; end_date: string }[] | null) ?? []) {
    windows.push({ start_date: block.start_date, end_date: block.end_date, kind: "block" });
  }

  return windows;
}

export async function getCategories(): Promise<Category[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("*").order("sort_order");
  return (data as Category[] | null) ?? [];
}

export async function getPickupLocations(): Promise<PickupLocation[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pickup_locations")
    .select("*")
    .eq("is_active", true)
    .order("name");
  return (data as PickupLocation[] | null) ?? [];
}

/** Admin view: every pickup location, including hidden and unmapped rows. */
export async function getAllPickupLocations(): Promise<PickupLocation[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("pickup_locations").select("*").order("name");
  return (data as PickupLocation[] | null) ?? [];
}

export async function getPickupLocationStats(): Promise<
  { location: PickupLocation; availableCount: number }[]
> {
  const supabase = await createClient();

  const [locations, items] = await Promise.all([
    getPickupLocations(),
    supabase.from("items").select("pickup_location_id").eq("status", "available"),
  ]);

  const counts = new Map<string, number>();
  for (const row of (items.data as { pickup_location_id: string | null }[] | null) ?? []) {
    if (!row.pickup_location_id) continue;
    counts.set(row.pickup_location_id, (counts.get(row.pickup_location_id) ?? 0) + 1);
  }

  return locations.map((location) => ({
    location,
    availableCount: counts.get(location.id) ?? 0,
  }));
}

export type { Item };
