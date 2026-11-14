"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { bennettEmailSchema, resetPasswordSchema } from "@borrowbuddy/shared";
import { flash } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";

export type ResetRequestState = {
  status: "idle" | "sent" | "error";
  message?: string;
  email?: string;
};

export type NewPasswordState = {
  status: "idle" | "error";
  message?: string;
};

/** Where the reset email sends the student back to: this site's own host. */
async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Emails a password reset link. Always answers the same way, whether or not
 * the address has an account, so the form can't be used to check who's
 * registered. The link opens /auth/callback, which signs the student in for
 * the reset and continues to /reset-password.
 */
export async function requestPasswordReset(
  _previous: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const parsed = bennettEmailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check your email." };
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return { status: "error", message: "Password reset isn't available right now. Try again later." };
  }

  const redirectTo = `${await siteOrigin()}/auth/callback?next=/reset-password`;
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo });

  if (error && (error.status === 429 || /rate limit|too many|security purposes/i.test(error.message))) {
    return {
      status: "error",
      message: "Too many reset emails were asked for. Wait a few minutes, then try again.",
    };
  }

  return { status: "sent", email: parsed.data };
}

/**
 * Sets the new password for the student signed in by the reset link, then
 * signs every other device out: whoever knew the old password loses access.
 */
export async function setNewPassword(
  _previous: NewPasswordState,
  formData: FormData,
): Promise<NewPasswordState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm_password: formData.get("confirm_password"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: "This reset link has expired. Ask for a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return {
      status: "error",
      message:
        error.code === "same_password" || /different from the old/i.test(error.message)
          ? "That's your current password. Choose a new one."
          : error.code === "weak_password"
            ? "Choose a stronger password: 8+ characters with a letter and a number."
            : error.message,
    };
  }

  await supabase.auth.signOut({ scope: "others" });
  await flash("Password changed. You're signed in, and your other devices were signed out.");
  redirect("/home");
}
