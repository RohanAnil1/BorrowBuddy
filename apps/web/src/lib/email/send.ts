import "server-only";

import nodemailer from "nodemailer";
import { getServerEnv } from "@/lib/env";

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  /** Resend only: the same key never sends twice. */
  idempotencyKey?: string;
};

export type SendResult = { ok: true; via: "smtp" | "resend" } | { ok: false; error: string };

/**
 * Which sender to use: EMAIL_TRANSPORT when it names a configured one,
 * otherwise SMTP when its login is set, otherwise Resend.
 */
export function emailTransport(): "smtp" | "resend" | null {
  const env = getServerEnv();
  const smtp = Boolean(env.SMTP_USER && env.SMTP_PASS);
  const resend = Boolean(env.RESEND_API_KEY && env.NOTIFICATIONS_FROM_EMAIL);
  if (env.EMAIL_TRANSPORT === "resend" && resend) return "resend";
  if (env.EMAIL_TRANSPORT === "smtp" && smtp) return "smtp";
  if (smtp) return "smtp";
  if (resend) return "resend";
  return null;
}

let transporter: nodemailer.Transporter | null = null;

function smtp() {
  const env = getServerEnv();
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return transporter;
}

/**
 * Sends one email through Gmail/SMTP when SMTP_USER and SMTP_PASS are set,
 * otherwise through Resend. Never throws: failures come back as { ok: false }.
 */
export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  const env = getServerEnv();
  const via = emailTransport();

  if (via === "smtp") {
    // Gmail rewrites any other From address to the signed-in account anyway.
    const from = env.NOTIFICATIONS_FROM_EMAIL?.includes(env.SMTP_USER ?? "\u0000")
      ? env.NOTIFICATIONS_FROM_EMAIL
      : `BorrowBuddy <${env.SMTP_USER}>`;
    try {
      await smtp().sendMail({
        from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: email.headers,
      });
      return { ok: true, via };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "SMTP send failed" };
    }
  }

  if (via === "resend") {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        ...(email.idempotencyKey ? { "Idempotency-Key": email.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: env.NOTIFICATIONS_FROM_EMAIL,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: email.headers,
      }),
    }).catch(() => null);
    if (response?.ok) return { ok: true, via };
    const detail = response ? await response.text().catch(() => "") : "network error";
    return { ok: false, error: `Resend ${response?.status ?? ""} ${detail}`.trim().slice(0, 300) };
  }

  return { ok: false, error: "Email is not configured: set SMTP_USER and SMTP_PASS (or RESEND_API_KEY)." };
}
