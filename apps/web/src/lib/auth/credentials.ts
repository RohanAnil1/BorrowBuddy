"use server";

import { redirect } from "next/navigation";
import { signInSchema, signUpSchema } from "@borrowbuddy/shared";
import { createClient } from "@/lib/supabase/server";

export type AuthState = {
  status: "idle" | "error";
  message?: string;
};

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

  // Email confirmations are disabled, so a successful signup starts the
  // session immediately and onboarding (name + student ID) can begin.
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return {
      status: "error",
      message: /already registered/i.test(error.message)
        ? "That email already has a pass — sign in instead."
        : error.message,
    };
  }

  redirect("/onboarding");
}
