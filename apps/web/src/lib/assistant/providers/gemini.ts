import "server-only";
import {
  providerErrorFrom,
  ProviderError,
  readSse,
  type LLMChunk,
  type LLMMessage,
  type LLMProvider,
  type LLMRequest,
  type ToolCall,
} from "./types";

type GeminiPart = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
};
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

function toContents(messages: LLMMessage[]): GeminiContent[] {
  const contents: GeminiContent[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      contents.push({ role: "user", parts: [{ text: message.content }] });
    } else if (message.role === "assistant") {
      const parts: GeminiPart[] = [];
      if (message.content) parts.push({ text: message.content });
      for (const call of message.toolCalls ?? []) {
        parts.push({
          functionCall: { name: call.name, args: call.args },
          ...(call.signature ? { thoughtSignature: call.signature } : {}),
        });
      }
      if (parts.length) contents.push({ role: "model", parts });
    } else {
      let response: unknown;
      try {
        response = JSON.parse(message.content);
      } catch {
        response = message.content;
      }
      const part: GeminiPart = { functionResponse: { name: message.name, response: { result: response } } };
      const last = contents.at(-1);
      // Parallel tool results belong in one user turn.
      if (last?.role === "user" && last.parts.every((p) => p.functionResponse)) last.parts.push(part);
      else contents.push({ role: "user", parts: [part] });
    }
  }
  return contents;
}

export function createGeminiProvider(apiKey: string, model: string): LLMProvider {
  return {
    id: `gemini:${model}`,
    async *stream({ system, messages, tools, signal }: LLMRequest): AsyncGenerator<LLMChunk> {
      const declarations = tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        ...(Object.keys(tool.parameters.properties).length ? { parameters: tool.parameters } : {}),
      }));
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: toContents(messages),
            ...(declarations.length ? { tools: [{ functionDeclarations: declarations }] } : {}),
            generationConfig: { temperature: 0.4, maxOutputTokens: 900 },
          }),
          signal,
        },
      );
      if (!response.ok || !response.body) {
        throw providerErrorFrom(response.status, await response.text().catch(() => ""), "gemini");
      }

      const calls: ToolCall[] = [];
      for await (const data of readSse(response.body)) {
        let payload: {
          candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
          error?: { message?: string; code?: number };
        };
        try {
          payload = JSON.parse(data);
        } catch {
          continue;
        }
        if (payload.error) {
          const status = payload.error.code ?? 500;
          throw new ProviderError(`gemini: ${payload.error.message}`, status, status === 429 || status >= 500);
        }
        for (const part of payload.candidates?.[0]?.content?.parts ?? []) {
          if (part.thought) continue;
          if (part.functionCall) {
            calls.push({
              id: `call_${calls.length}_${Date.now().toString(36)}`,
              name: part.functionCall.name,
              args: part.functionCall.args ?? {},
              signature: part.thoughtSignature,
            });
          } else if (part.text) {
            yield { type: "text", delta: part.text };
          }
        }
      }
      if (calls.length) yield { type: "tool_calls", calls };
    },
  };
}
