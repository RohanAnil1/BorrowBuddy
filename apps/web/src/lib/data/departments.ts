import { createClient } from "@/lib/supabase/server";

export type Department = { id: string; name: string };

/**
 * The departments students pick from, in display order. A profile whose
 * department has been retired still sees it, so saving the form keeps it.
 */
export async function getDepartments(current?: { id: string | null; name: string | null }): Promise<Department[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("departments")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  const list = (data as Department[] | null) ?? [];
  if (current?.id && current.name && !list.some((department) => department.id === current.id)) {
    return [...list, { id: current.id, name: current.name }];
  }
  return list;
}
