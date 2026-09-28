"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { pickupLocationSchema } from "@borrowbuddy/shared";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

function readPin(formData: FormData) {
  return {
    id: (formData.get("id") as string) || undefined,
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    xp: Number(formData.get("xp")),
    yp: Number(formData.get("yp")),
    map_label: formData.get("map_label"),
    is_active: formData.get("is_active") === "on",
  };
}

export async function savePin(formData: FormData): Promise<void> {
  await requireAdmin();

  const parsed = pickupLocationSchema.safeParse(readPin(formData));
  if (!parsed.success) {
    redirect(
      `/admin?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid pin")}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_pickup_location", {
    p_id: parsed.data.id ?? null,
    p_name: parsed.data.name,
    p_description: parsed.data.description ?? null,
    p_xp: parsed.data.xp,
    p_yp: parsed.data.yp,
    p_map_label: parsed.data.map_label,
    p_is_active: parsed.data.is_active,
  });

  if (error) {
    redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin");
  revalidatePath("/");
}

export async function removePin(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) {
    redirect("/admin?error=Missing%20pin");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_pickup_location", { p_id: id });

  if (error) {
    redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin");
  revalidatePath("/");
}
