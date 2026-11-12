import { z } from "zod";

const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
});

const serverEnvSchema = clientEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  RESEND_API_KEY: z.string().optional(),
  NOTIFICATIONS_FROM_EMAIL: z.string().optional(),
  /** This account is bootstrapped as admin + verified on first sign-in. */
  ADMIN_EMAIL: z.email().optional(),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** True when the public Supabase keys are present. Lets the app render
 *  (landing, login) before a Supabase project has been wired up. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/** Safe to call from the browser; only exposes NEXT_PUBLIC_* values. */
export function getClientEnv(): ClientEnv {
  return clientEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
}

/** Server-only. Never import this into a Client Component. */
export function getServerEnv(): ServerEnv {
  return serverEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    NOTIFICATIONS_FROM_EMAIL: process.env.NOTIFICATIONS_FROM_EMAIL,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  });
}

/* ------------------------------ Buddy assistant ----------------------------- */

const assistantEnvSchema = z.object({
  /** "gemini" | "groq" | "local". Defaults to whichever key is present. */
  ASSISTANT_PROVIDER: z.enum(["gemini", "groq", "local"]).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default("gemini-flash-latest"),
  GROQ_API_KEY: z.string().min(1).optional(),
  GROQ_MODEL: z.string().min(1).default("openai/gpt-oss-120b"),
});

export type AssistantEnv = z.infer<typeof assistantEnvSchema>;

/** Server-only. Every field is optional, so a missing key never breaks the app:
 *  Buddy falls back to its local (rules-based) brain instead. */
export function getAssistantEnv(): AssistantEnv {
  const blank = (value: string | undefined) => (value && value.trim() ? value.trim() : undefined);
  const parsed = assistantEnvSchema.safeParse({
    ASSISTANT_PROVIDER: blank(process.env.ASSISTANT_PROVIDER),
    GEMINI_API_KEY: blank(process.env.GEMINI_API_KEY),
    GEMINI_MODEL: blank(process.env.GEMINI_MODEL),
    GROQ_API_KEY: blank(process.env.GROQ_API_KEY),
    GROQ_MODEL: blank(process.env.GROQ_MODEL),
  });
  return parsed.success
    ? parsed.data
    : { GEMINI_MODEL: "gemini-flash-latest", GROQ_MODEL: "openai/gpt-oss-120b" };
}
