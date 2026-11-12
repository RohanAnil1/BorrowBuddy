import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ASSISTANT_LIMITS } from "./types";

export type RateDecision = { allowed: boolean; remaining: number; retryAfter: number };

// Fallback for when the assistant_hit() migration hasn't been applied yet.
// Per-instance only, which is fine as a safety net.
const memory = new Map<string, { start: number; count: number }>();

function memoryHit(userId: string): RateDecision {
  const now = Date.now();
  const windowMs = ASSISTANT_LIMITS.rateWindowSeconds * 1000;
  const slot = memory.get(userId);
  const fresh = !slot || now - slot.start > windowMs;
  const next = fresh ? { start: now, count: 1 } : { start: slot.start, count: slot.count + 1 };
  memory.set(userId, next);
  if (memory.size > 5000) memory.delete(memory.keys().next().value!);
  const allowed = next.count <= ASSISTANT_LIMITS.rateLimit;
  return {
    allowed,
    remaining: Math.max(0, ASSISTANT_LIMITS.rateLimit - next.count),
    retryAfter: allowed ? 0 : Math.ceil((next.start + windowMs - now) / 1000),
  };
}

let rpcMissing = false;

/** Counts one message for the signed-in student (shared across instances via Postgres). */
export async function hitAssistantLimit(supabase: SupabaseClient, userId: string): Promise<RateDecision> {
  if (!rpcMissing) {
    const { data, error } = await supabase.rpc("assistant_hit", {
      p_limit: ASSISTANT_LIMITS.rateLimit,
      p_window_seconds: ASSISTANT_LIMITS.rateWindowSeconds,
    });
    if (!error) {
      const row = (Array.isArray(data) ? data[0] : data) as
        | { allowed: boolean; remaining: number; retry_after: number }
        | undefined;
      if (row) return { allowed: row.allowed, remaining: row.remaining, retryAfter: row.retry_after };
    } else if (error.code === "PGRST202" || error.code === "42883") {
      rpcMissing = true;
      console.warn("[assistant] assistant_hit() not found; using in-memory rate limit. Apply the migration.");
    } else {
      console.error("[assistant] rate limit check failed:", error.message);
    }
  }
  return memoryHit(userId);
}
