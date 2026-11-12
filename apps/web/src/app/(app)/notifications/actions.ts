"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { flash } from "@/lib/flash";

export async function markAllRead(): Promise<void> {
  const profile = await requireProfile();
  const supabase = await createClient();

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", profile.id)
    .is("read_at", null);

  await flash("All caught up.");
  // The bell lives in the shared layout, so refresh every page's badge.
  revalidatePath("/", "layout");
}
