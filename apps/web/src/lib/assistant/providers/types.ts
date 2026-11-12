import type { ToolParameters } from "../tools";

export type ToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /** Gemini thought signature, echoed back on the next turn when present. */
  signature?: string;
};

export type LLMMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; callId: string; name: string; content: string };

export type LLMToolSpec = { name: string; description: string; parameters: ToolParameters };

export type LLMChunk = { type: "text"; delta: string } | { type: "tool_calls"; calls: ToolCall[] };

export type LLMRequest = {
  system: string;
  messages: LLMMessage[];
  tools: LLMToolSpec[];
  signal?: AbortSignal;
};

export interface LLMProvider {
  readonly id: string;
  stream(request: LLMRequest): AsyncGenerator<LLMChunk>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    /** Seconds the provider asked us to wait, when it said. */
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export function providerErrorFrom(
  status: number,
  body: string,
  provider: string,
  headers?: Headers,
): ProviderError {
  const retryable = status === 429 || status >= 500 || status === 408;
  const header = Number(headers?.get("retry-after"));
  const inBody = Number(body.match(/try again in ([\d.]+)s/i)?.[1]);
  const retryAfter = Number.isFinite(header) && header > 0 ? header : Number.isFinite(inBody) ? inBody : undefined;
  return new ProviderError(`${provider} ${status}: ${body.slice(0, 300)}`, status, retryable, retryAfter);
}

/** Parse a fetch body as server-sent events, yielding each `data:` payload. */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, "");
        const data = rawEvent
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data) yield data;
      }
    }
    const tail = buffer.trim();
    if (tail.startsWith("data:")) yield tail.slice(5).trimStart();
  } finally {
    reader.releaseLock();
  }
}
