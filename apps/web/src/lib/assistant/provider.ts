import "server-only";
import { getAssistantEnv } from "@/lib/env";
import { createGeminiProvider } from "./providers/gemini";
import { createGroqProvider } from "./providers/groq";
import { createLocalProvider } from "./providers/local";
import type { LLMProvider } from "./providers/types";

/**
 * Ordered provider chain. The route tries each in turn when one is
 * rate-limited or down (before it has streamed anything), and the local brain
 * is always last, so Buddy keeps answering on a bad free-tier day.
 */
export function providerChain(): LLMProvider[] {
  const env = getAssistantEnv();
  const gemini = env.GEMINI_API_KEY ? createGeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL) : null;
  const groq = env.GROQ_API_KEY ? createGroqProvider(env.GROQ_API_KEY, env.GROQ_MODEL) : null;
  const local = createLocalProvider();

  if (env.ASSISTANT_PROVIDER === "local") return [local];
  const ordered = env.ASSISTANT_PROVIDER === "groq" ? [groq, gemini] : [gemini, groq];
  return [...ordered.filter((p): p is LLMProvider => p !== null), local];
}
