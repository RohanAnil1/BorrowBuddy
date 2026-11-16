"use server";

import { redirect } from "next/navigation";
import { bennettEmailSchema, signInSchema, signUpSchema } from "@borrowbuddy/shared";
import { siteOrigin } from "@/lib/auth/site-origin";
import { createClient } from "@/lib/supabase/server";

/**
 * "confirm": the account exists but its email isn't confirmed yet; the form
 * shows "check your inbox" for [email] with a way to send the link again.
 */
export type AuthState = {
  status: "idle" | "error" | "confirm";
  message?: string;
  email?: string;
  resent?: boolean;
};

/** Where the confirmation email brings the student back: signed in, onto onboarding. */
async function confirmRedirect(): Promise<string> {
  return `${await siteOrigin()}/auth/callback?next=/onboarding`;
}

function safeNext(value: FormDataEntryValue | null): string {
  const next = String(value ?? "").trim();
  return next.startsWith("/") && !next.startsWith("//") ? next : "/home";
}

export async function signInWithCredentials(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check the form.",
    };
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return {
      status: "error",
      message:
        "Supabase isn't configured yet. Add your project keys to apps/web/.env.local and restart the dev server.",
    };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    if (error.code === "email_not_confirmed" || /email not confirmed/i.test(error.message)) {
      return { status: "confirm", email: parsed.data.email };
    }
    return {
      status: "error",
      message: /invalid login credentials/i.test(error.message)
        ? "Invalid email or password."
        : error.message,
    };
  }

  redirect(safeNext(formData.get("next")));
}

export async function signUpWithCredentials(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirm_password: formData.get("confirm_password"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check the form.",
    };
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return {
      status: "error",
      message:
        "Supabase isn't configured yet. Add your project keys to apps/web/.env.local and restart the dev server.",
    };
  }

  // With email confirmation on, sign-up sends a link and starts no session;
  // with it off, the session starts now and onboarding can begin.
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: await confirmRedirect() },
  });

  if (error) {
    return {
      status: "error",
      message: /already registered|already exists/i.test(error.message)
        ? "That email already has a pass — sign in instead."
        : /rate limit/i.test(error.message)
          ? "Too many emails sent. Wait a few minutes, then try again."
          : error.message,
    };
  }

  if (data.session) redirect("/onboarding");
  // An address that already has a confirmed account comes back with no identities.
  if (data.user && (data.user.identities?.length ?? 0) === 0) {
    return { status: "error", message: "That email already has a pass — sign in instead." };
  }
  return { status: "confirm", email: parsed.data.email };
}

/** Sends the sign-up confirmation link again. */
export async function resendConfirmation(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = bennettEmailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check your email." };
  }
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: parsed.data,
      options: { emailRedirectTo: await confirmRedirect() },
    });
    if (error && (error.status === 429 || /rate limit|security purposes/i.test(error.message))) {
      return {
        status: "confirm",
        email: parsed.data,
        message: "Too many emails sent. Wait a few minutes, then try again.",
      };
    }
  } catch {
    // Same answer either way, so the form can't be used to check who's registered.
  }
  return { status: "confirm", email: parsed.data, resent: true };
}
