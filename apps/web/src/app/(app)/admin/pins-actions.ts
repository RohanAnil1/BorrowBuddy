"use server";

import { pickupLocationSchema } from "@borrowbuddy/shared";
import { UUID, finishAdminAction } from "@/lib/admin-actions";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

const BACK = "/admin/pins";

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
    return finishAdminAction({ message: parsed.error.issues[0]?.message ?? "Check the pin details." }, "", BACK);
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

  return finishAdminAction(
    error,
    parsed.data.id ? `Saved ${parsed.data.name}.` : `Added ${parsed.data.name} to the map.`,
    BACK,
    ["/", "/map"],
  );
}

export async function removePin(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return finishAdminAction({ message: "Missing pickup spot." }, "", BACK);

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_pickup_location", { p_id: id });

  return finishAdminAction(error, "Pickup spot removed.", BACK, ["/", "/map"]);
}
