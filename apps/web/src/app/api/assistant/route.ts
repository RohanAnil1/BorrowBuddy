import { z } from "zod";
import { providerChain } from "@/lib/assistant/provider";
import { ProviderError, type LLMMessage, type LLMProvider, type ToolCall } from "@/lib/assistant/providers/types";
import { hitAssistantLimit } from "@/lib/assistant/rate-limit";
import { buildSystemPrompt } from "@/lib/assistant/system-prompt";
import { ASSISTANT_TOOLS, runTool } from "@/lib/assistant/tools";
import { ASSISTANT_LIMITS, type AssistantEvent } from "@/lib/assistant/types";
import type { Profile } from "@borrowbuddy/shared";
import { getCurrentProfile } from "@/lib/data/profiles";
import { createClient, tokenClient, withBearerToken } from "@/lib/supabase/server";

export const maxDuration = 60;

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    )
    .min(1)
    .max(40),
  path: z.string().max(200).optional(),
});

function json(status: number, body: Record<string, unknown>, headers?: HeadersInit) {
  return Response.json(body, { status, headers });
}

/** The Android app authenticates with its Supabase access token. */
function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(\S{20,4096})$/i);
  return match ? match[1] : null;
}

async function profileForToken(token: string): Promise<Profile | null> {
  const supabase = tokenClient(token);
  const { data: user } = await supabase.auth.getUser(token);
  if (!user.user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.user.id).maybeSingle();
  return (data as Profile | null) ?? null;
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return handle(request, await getCurrentProfile());
  const profile = await profileForToken(token);
  // Every createClient() inside this scope (tools, rate limit) acts as this user.
  return withBearerToken(token, () => handle(request, profile));
}

async function handle(request: Request, profile: Profile | null) {
  if (!profile) return json(401, { error: "Sign in to talk to Buddy.", code: "unauthenticated" });
  if (profile.verification_status !== "verified") {
    return json(403, { error: "Buddy unlocks once your student ID is verified.", code: "unverified" });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return json(400, { error: "That message couldn't be read.", code: "bad_request" });
  }

  const last = body.messages.at(-1)!;
  const question = last.content.trim();
  if (last.role !== "user" || !question) {
    return json(400, { error: "Ask Buddy something first.", code: "bad_request" });
  }
  if (question.length > ASSISTANT_LIMITS.maxMessageChars) {
    return json(400, {
      error: `Keep it under ${ASSISTANT_LIMITS.maxMessageChars} characters.`,
      code: "too_long",
    });
  }

  const supabase = await createClient();
  const limit = await hitAssistantLimit(supabase, profile.id);
  if (!limit.allowed) {
    return json(
      429,
      { error: "Buddy needs a quick breather.", code: "rate_limited", retryAfter: limit.retryAfter },
      { "retry-after": String(limit.retryAfter) },
    );
  }

  // Only plain text history travels; cards and tool data are rebuilt per turn.
  const history: LLMMessage[] = body.messages
    .slice(-ASSISTANT_LIMITS.maxHistoryTurns)
    .filter((m) => m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, m.role === "user" ? 1000 : 1600) }));
  while (history[0] && history[0].role !== "user") history.shift();

  const system = buildSystemPrompt({
    firstName: profile.full_name?.split(/\s+/)[0] ?? "",
    path: body.path ?? "/",
  });
  const toolSpecs = ASSISTANT_TOOLS.map(({ name, description, parameters }) => ({ name, description, parameters }));
  const ctx = { profile };
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: AssistantEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      const messages = [...history];
      const chain = providerChain();
      let providerIndex = 0;
      let waitedMs = 0;
      let announced: string | null = null;

      const announce = (provider: LLMProvider) => {
        if (announced === provider.id) return;
        announced = provider.id;
        emit({ type: "meta", mode: provider.id === "local" ? "local" : "ai", provider: provider.id });
      };

      try {
        for (let step = 0; step <= ASSISTANT_LIMITS.maxToolSteps; step++) {
          const allowTools = step < ASSISTANT_LIMITS.maxToolSteps;
          let text = "";
          let calls: ToolCall[] = [];

          // Try providers in order until one answers this step.
          let retried = false;
          for (;;) {
            const provider = chain[providerIndex];
            announce(provider);
            text = "";
            calls = [];
            try {
              for await (const chunk of provider.stream({
                system,
                messages,
                tools: allowTools ? toolSpecs : [],
                signal: request.signal,
              })) {
                if (chunk.type === "text") {
                  text += chunk.delta;
                  emit({ type: "text", delta: chunk.delta });
                } else {
                  calls = chunk.calls.filter((c) => ASSISTANT_TOOLS.some((t) => t.name === c.name));
                }
              }
              break;
            } catch (error) {
              if (request.signal.aborted) throw error;
              // A dropped connection (flaky Wi-Fi, TLS-inspecting antivirus) often
              // succeeds on a second try; retry once before changing provider.
              const network = !(error instanceof ProviderError);
              if (network && !text && !retried) {
                retried = true;
                await new Promise((resolve) => setTimeout(resolve, 400));
                continue;
              }
              // Free tiers cap tokens per minute and usually free up within seconds.
              // A short wait keeps the real AI answering instead of quick mode.
              if (
                error instanceof ProviderError &&
                error.status === 429 &&
                !text &&
                error.retryAfter !== undefined &&
                error.retryAfter <= 6 &&
                waitedMs < 9000
              ) {
                const wait = Math.ceil(error.retryAfter * 1000) + 250;
                waitedMs += wait;
                emit({ type: "tool", name: "wait", label: "Catching my breath" });
                await new Promise((resolve) => setTimeout(resolve, wait));
                continue;
              }
              // Rate limits, outages, a retired model name or a bad key: hand the
              // same step to the next provider, as long as nothing was streamed.
              const canFallBack = !text && providerIndex < chain.length - 1;
              if (error instanceof ProviderError && error.status === 429) {
                console.warn(`[assistant] ${provider.id} is rate-limited; falling back.`);
              }
              const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : "";
              console.error(
                `[assistant] ${provider.id} failed at step ${step}:`,
                error instanceof Error ? `${error.message}${cause}` : error,
              );
              if (!canFallBack) throw error;
              providerIndex++;
              retried = false;
            }
          }

          if (!calls.length) {
            if (!text.trim()) {
              emit({ type: "text", delta: "I'm not sure about that one. Could you ask it another way?" });
            }
            break;
          }

          messages.push({ role: "assistant", content: text, toolCalls: calls });
          for (const call of calls) {
            const tool = ASSISTANT_TOOLS.find((t) => t.name === call.name)!;
            emit({ type: "tool", name: tool.name, label: tool.label });
            const outcome = await runTool(call.name, call.args, ctx);
            if (outcome.card) emit({ type: "card", card: outcome.card });
            messages.push({
              role: "tool",
              callId: call.id,
              name: call.name,
              content: JSON.stringify(outcome.result ?? null).slice(0, 6000),
            });
          }
        }
        emit({ type: "done" });
      } catch (error) {
        if (!request.signal.aborted) {
          console.error("[assistant] conversation failed:", error);
          emit({
            type: "error",
            code: "unavailable",
            message: "Buddy lost the signal for a second. Try again.",
          });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Client already went away.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
      "x-ratelimit-remaining": String(limit.remaining),
    },
  });
}
