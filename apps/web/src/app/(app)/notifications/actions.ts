"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export async function markAllRead(): Promise<void> {
  const profile = await requireProfile();
  const supabase = await createClient();

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", profile.id)
    .is("read_at", null);

  revalidatePath("/notifications");
  revalidatePath("/home");
}
