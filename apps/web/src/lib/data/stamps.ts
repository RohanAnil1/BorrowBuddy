import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { toProfileStamps, type ProfileStamp } from "@/lib/stamps";

/**
 * Achievement stamps for a member ID card. The RPC returns aggregates only and
 * requires a verified viewer, so callers should skip it for unverified ones.
 * Stamps are decorative: a failure hides them instead of breaking the page.
 */
export const getProfileStamps = cache(async (userId: string): Promise<ProfileStamp[] | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_profile_stamps", { p_profile_id: userId });
  if (error) return null;
  return toProfileStamps(data);
});
