import type {
  AvailabilityWindow,
  Category,
  Item,
  ItemCondition,
  ItemWithOwner,
  PickupLocation,
} from "@borrowbuddy/shared";
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
    const { data, error } = await supabase.rpc("get_busy_item_ids", {
      p_start: filters.startDate,
      p_end: filters.endDate,
    });
    if (error) throw new Error(`Availability lookup failed: ${error.message}`);
    excludedIds = ((data as { item_id: string }[] | null) ?? []).map((row) => row.item_id);
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

  const { data, error } = await supabase.rpc("get_item_availability", { p_item_id: itemId });
  if (error) throw new Error(`Availability lookup failed: ${error.message}`);
  return (data as AvailabilityWindow[] | null) ?? [];
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
