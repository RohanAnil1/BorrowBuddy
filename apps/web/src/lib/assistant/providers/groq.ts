import "server-only";
import {
  providerErrorFrom,
  readSse,
  type LLMChunk,
  type LLMMessage,
  type LLMProvider,
  type LLMRequest,
  type ToolCall,
} from "./types";

type OpenAIMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

function toMessages(system: string, messages: LLMMessage[]): OpenAIMessage[] {
  const out: OpenAIMessage[] = [{ role: "system", content: system }];
  for (const message of messages) {
    if (message.role === "user") out.push({ role: "user", content: message.content });
    else if (message.role === "assistant") {
      out.push({
        role: "assistant",
        content: message.content || null,
        ...(message.toolCalls?.length
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: "function" as const,
                function: { name: call.name, arguments: JSON.stringify(call.args) },
              })),
            }
          : {}),
      });
    } else out.push({ role: "tool", tool_call_id: message.callId, content: message.content });
  }
  return out;
}

/** Groq speaks the OpenAI chat-completions dialect. */
export function createGroqProvider(apiKey: string, model: string): LLMProvider {
  return {
    id: `groq:${model}`,
    async *stream({ system, messages, tools, signal }: LLMRequest): AsyncGenerator<LLMChunk> {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          stream: true,
          temperature: 0.4,
          max_tokens: 900,
          messages: toMessages(system, messages),
          ...(tools.length
            ? {
                tool_choice: "auto",
                tools: tools.map((tool) => ({
                  type: "function",
                  function: { name: tool.name, description: tool.description, parameters: tool.parameters },
                })),
              }
            : {}),
        }),
        signal,
      });
      if (!response.ok || !response.body) {
        throw providerErrorFrom(response.status, await response.text().catch(() => ""), "groq", response.headers);
      }

      const pending = new Map<number, { id: string; name: string; args: string }>();
      for await (const data of readSse(response.body)) {
        if (data === "[DONE]") break;
        let payload: {
          choices?: {
            delta?: {
              content?: string | null;
              tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[];
            };
          }[];
        };
        try {
          payload = JSON.parse(data);
        } catch {
          continue;
        }
        const delta = payload.choices?.[0]?.delta;
        if (!delta) continue;
        if (delta.content) yield { type: "text", delta: delta.content };
        for (const piece of delta.tool_calls ?? []) {
          const slot = pending.get(piece.index) ?? { id: "", name: "", args: "" };
          if (piece.id) slot.id = piece.id;
          if (piece.function?.name) slot.name += piece.function.name;
          if (piece.function?.arguments) slot.args += piece.function.arguments;
          pending.set(piece.index, slot);
        }
      }
      if (pending.size) {
        const calls: ToolCall[] = [...pending.values()].map((slot, index) => {
          let args: Record<string, unknown> = {};
          try {
            args = slot.args ? JSON.parse(slot.args) : {};
          } catch {
            args = {};
          }
          return { id: slot.id || `call_${index}`, name: slot.name, args };
        });
        yield { type: "tool_calls", calls };
      }
    },
  };
}
