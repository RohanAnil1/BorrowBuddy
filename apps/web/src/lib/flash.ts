import "server-only";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

export type Flash = { id: string; message: string; tone: "success" | "error" };

const COOKIE = "bb-flash";

/**
 * Queue a one-time toast for the next render. Call from a server action; the
 * app layout reads it and the client toaster shows it once, then clears it.
 */
export async function flash(message: string, tone: Flash["tone"] = "success") {
  const value: Flash = { id: randomUUID(), message: message.slice(0, 200), tone };
  (await cookies()).set(COOKIE, encodeURIComponent(JSON.stringify(value)), {
    path: "/",
    maxAge: 60,
    sameSite: "lax",
    httpOnly: false, // the toaster clears it in the browser after showing it
    secure: process.env.NODE_ENV === "production",
  });
}

/** The pending toast, if any. Malformed or tampered values are ignored. */
export async function readFlash(): Promise<Flash | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<Flash>;
    if (typeof parsed.id !== "string" || typeof parsed.message !== "string") return null;
    return {
      id: parsed.id.slice(0, 64),
      message: parsed.message.slice(0, 200),
      tone: parsed.tone === "error" ? "error" : "success",
    };
  } catch {
    return null;
  }
}
