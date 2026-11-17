import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { flash } from "@/lib/flash";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A same-console path to return to after an action, or the fallback. */
export function adminReturnPath(formData: FormData, fallback: string): string {
  const value = String(formData.get("return_to") ?? "");
  return value.startsWith("/admin") && !value.startsWith("//") && !value.includes("\\") ? value : fallback;
}

/**
 * Ends every admin action the same way: a toast saying what happened (or
 * what went wrong), fresh counts everywhere in the console, and back to the
 * page the admin was on.
 */
export async function finishAdminAction(
  error: { message: string } | null,
  success: string,
  path: string,
  alsoRevalidate: string[] = [],
): Promise<never> {
  await flash(error ? error.message : success, error ? "error" : "success");
  revalidatePath("/admin", "layout");
  for (const extra of alsoRevalidate) revalidatePath(extra);
  redirect(path);
}
