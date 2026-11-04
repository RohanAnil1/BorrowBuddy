"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { campusPostSchema } from "@borrowbuddy/shared";
import { z } from "zod";
import { requireVerified } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export type CampusActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  href?: string;
  code?: string;
  expires?: string;
};
const actions = new Set([
  "save_post",
  "claim",
  "withdraw_claim",
  "review_claim",
  "reserve",
  "cancel_transfer",
  "revoke_claim",
  "generate_code",
  "confirm_code",
  "send_message",
  "read_thread",
  "hide_post",
  "save_schedule",
  "book",
  "cancel_appointment",
]);
export async function campusAction(
  _previous: CampusActionState,
  form: FormData,
): Promise<CampusActionState> {
  await requireVerified();
  const action = String(form.get("action") ?? "");
  if (!actions.has(action))
    return { status: "error", message: "Unknown campus action." };
  const payload: Record<string, unknown> = Object.fromEntries(
    [...form.entries()].filter(([k]) => k !== "action"),
  );
  let result: CampusActionState;
  try {
    for (const key of ["images", "weekly", "exceptions"])
      if (typeof payload[key] === "string")
        payload[key] = JSON.parse(payload[key] as string);
    if (action === "save_post") {
      payload.hold_hours = Number(payload.hold_hours ?? 48);
      for (const key of ["pickup_location_id", "condition", "found_on"])
        payload[key] ||= null;
      const parsed = campusPostSchema.safeParse(payload);
      if (!parsed.success)
        return {
          status: "error",
          message: parsed.error.issues[0]?.message ?? "Check the form.",
        };
      Object.assign(payload, parsed.data);
    } else if (action !== "save_schedule") {
      for (const key of ["id", "loan_id", "transfer_id", "client_id"])
        if (payload[key] && !z.uuid().safeParse(payload[key]).success)
          return { status: "error", message: "Invalid record identifier." };
    }
    const db = await createClient();
    const { data, error } = await db.rpc("campus_api", {
      p_action: action,
      p_data: payload,
    });
    if (error) return { status: "error", message: error.message };
    if (data?.ok === false) {
      revalidatePath("/campus", "layout");
      return { status: "error", message: data.error };
    }
    revalidatePath("/campus", "layout");
    revalidatePath("/notifications");
    revalidatePath("/admin");
    if (payload.loan_id) revalidatePath(`/loans/${payload.loan_id}`);
    if (action === "generate_code")
      return {
        status: "success",
        code: data.code,
        expires: data.expires_at,
        message: "Your code is ready. Show it only at collection.",
      };
    const href =
      action === "save_post"
        ? `/campus/${payload.kind === "found" ? "lost-found" : "giveaways"}/${data.id}`
        : action === "reserve"
          ? `/campus/collections/${data.id}`
          : undefined;
    result = {
      status: "success",
      message:
        action === "claim"
          ? "Your private claim has been sent to campus admins."
          : "Saved successfully.",
      href,
    };
  } catch {
    return {
      status: "error",
      message:
        "Could not complete that request. Your inputs are retained; please retry.",
    };
  }
  // Revalidation can replace a reservation form with its reserved state before
  // a client effect runs. Redirect in the action after the transaction succeeds.
  if (result.href) redirect(result.href);
  return result;
}
