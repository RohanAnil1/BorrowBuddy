"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  // Sign out of this browser only. Supabase's default ("global") also ends the
  // session on the student's phones, which then drop out at their next refresh.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}
