import "server-only";
import { FINE_PER_DAY, MAX_FINE_PER_LOAN } from "@borrowbuddy/shared";
import { campusToday, matchPolicy, POLICY, type PolicyTopic } from "../knowledge";
import type { LLMChunk, LLMMessage, LLMProvider, LLMRequest, ToolCall } from "./types";

/**
 * Buddy's local brain: a deterministic intent router that still calls the real
 * tools (live catalog, the student's own loans/fines). It runs when no free AI
 * key is configured, when every AI provider is rate-limited, and in tests.
 */

const STOPWORDS = new Set(
  (
    "a an the i im i'm me my we you your it is are am be to for of on in at and or any anyone someone " +
    "have has got get need needs want wanna looking look find search borrow borrowing lend rent " +
    "can could would will please pls plz is there there's theres does do some something one who " +
    "with from this that these those next tomorrow today weekend week day days just like help " +
    "buddy hey hi hello thanks thank available free campus show me"
  ).split(/\s+/),
);

const PAGES: { words: string[]; path: string; label: string }[] = [
  { words: ["map", "pickup spot", "spots"], path: "/map", label: "Open the campus map" },
  { words: ["fine", "ledger"], path: "/fines", label: "Open your fines" },
  { words: ["borrows", "my loans", "loans"], path: "/my/borrows", label: "Open your borrows" },
  { words: ["my items", "listings", "my listing"], path: "/my/items", label: "Open your listings" },
  { words: ["list an item", "new item", "add item", "lend"], path: "/items/new", label: "List an item" },
  { words: ["lost and found", "lost & found", "lost found"], path: "/campus/lost-found", label: "Open Lost & Found" },
  { words: ["giveaway"], path: "/campus/giveaways", label: "Open the giveaway shelf" },
  { words: ["appointment", "handovers", "schedule"], path: "/campus/handovers", label: "Open handover schedule" },
  { words: ["notification", "inbox"], path: "/notifications", label: "Open notifications" },
  { words: ["chat", "messages"], path: "/chat", label: "Open your chats" },
  { words: ["profile", "account", "id card"], path: "/me", label: "Open your profile" },
  { words: ["dashboard"], path: "/dashboard", label: "Open your dashboard" },
  { words: ["catalog", "browse", "shelf"], path: "/home", label: "Browse the catalog" },
];

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function parseDates(text: string): { start_date?: string; end_date?: string } {
  const { iso, weekday } = campusToday();
  const dow = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(
    weekday.toLowerCase(),
  );
  if (/\btoday\b/.test(text)) return { start_date: iso, end_date: iso };
  if (/\btomorrow\b/.test(text)) {
    const day = addDays(iso, 1);
    return { start_date: day, end_date: day };
  }
  if (/\bweekend\b/.test(text)) {
    // The upcoming Saturday–Sunday; on a weekend, "next weekend" means the following one.
    const next = /\bnext\s+weekend\b/.test(text);
    if (dow === 0 && !next) return { start_date: iso, end_date: iso };
    let toSat = dow === 0 ? 6 : 6 - dow;
    if (next && (dow === 6 || dow === 0)) toSat += dow === 6 ? 7 : 0;
    const sat = addDays(iso, toSat);
    return { start_date: sat, end_date: addDays(sat, 1) };
  }
  if (/\bnext\s+week\b/.test(text)) {
    const monday = addDays(iso, ((8 - dow) % 7) || 7);
    return { start_date: monday, end_date: addDays(monday, 6) };
  }
  return {};
}

function searchQuery(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))
    .slice(0, 3)
    .join(" ");
}

const personal = (t: string) => /\b(my|mine|i|i'm|im|me|do i|have i|am i)\b/.test(t);

function call(name: string, args: Record<string, unknown> = {}): ToolCall {
  return { id: `local_${name}_${Date.now().toString(36)}`, name, args };
}

function routeIntent(message: string): ToolCall[] | string {
  const t = message.toLowerCase().trim();

  if (/^(hi|hey|hello|yo|hola|namaste|sup|good (morning|evening|afternoon))\b[!. ]*$/.test(t)) {
    return "Hey! I'm Buddy. Ask me to find something to borrow, check your loans or fines, or explain how anything on BorrowBuddy works.";
  }
  if (/\b(thanks|thank you|thx|ty)\b/.test(t)) return "Anytime! Shout if you need anything else.";
  if (/\b(joke|funny|laugh)\b/.test(t)) {
    const jokes = [
      "Why did the cardboard box skip the party? It felt too boxed in. Anyway, need to borrow anything?",
      "I asked the tape to stick around. It's been very attached ever since. Now, what can I find you?",
      "I'm not a regular box. I'm a *think* outside the box. Ask me about loans, fines or the shelf!",
    ];
    return jokes[Math.floor(Math.random() * jokes.length)];
  }
  if (/\b(who are you|your name|what are you)\b/.test(t)) {
    return "I'm Buddy, a cardboard cargo bot with a scanner for a face. I search the shelf, keep an eye on your loans and fines, and know every BorrowBuddy rule.";
  }

  if (/\b(take me|go to|open|navigate|bring me|show me the)\b/.test(t)) {
    const page = PAGES.find((p) => p.words.some((w) => t.includes(w)));
    if (page) return [call("propose_navigation", { path: page.path, label: page.label })];
  }

  // "What's the fine if I'm 3 days late?" is a rule question, not a ledger lookup.
  const hypothetical = /\b(if|how much|how many|what happens|would|per day|\d+\s*days?)\b/.test(t);
  if (/\b(fine|fines|owe|penalt|ledger|outstanding)\b/.test(t) && personal(t) && !hypothetical) {
    return [call("my_fines")];
  }
  if (/\b(loan|loans|due|return|borrowed|borrowing|lending|lent)\b/.test(t) && personal(t) && !/\bhow\b/.test(t)) {
    return [call("my_loans")];
  }
  if (/\b(request|requests|approved|declined|pending)\b/.test(t) && personal(t) && !/\bhow\b/.test(t)) {
    return [call("my_requests")];
  }
  if (/\b(notification|notifications|unread|inbox)\b/.test(t)) return [call("my_unread")];
  if (/\b(pickup spots?|where (do|can) (i|we) meet|meeting spots?)\b/.test(t)) return [call("list_pickup_spots")];

  const wantsItem = /\b(find|need|borrow|looking for|anyone (have|got)|is there|search|got an?|have an?|rent|want)\b/.test(t);
  const topic = matchPolicy(t);
  if (wantsItem && !/\bhow\b/.test(t)) {
    const query = searchQuery(t);
    return [call("search_items", { ...(query ? { query } : {}), ...parseDates(t) })];
  }
  if (topic) return [call("explain_policy", { topic })];

  const query = searchQuery(t);
  if (query && query.split(" ").length <= 2) return [call("search_items", { query })];

  return "I'm running in quick mode right now, so I'm best at: finding items (\"find a calculator for this weekend\"), your loans, requests and fines, and how things work (fines, deposits, handovers, trust score). What do you need?";
}

function summarise(name: string, raw: string, previousUser: string): string {
  let data: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw);
    data = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { text: parsed };
  } catch {
    data = { text: raw };
  }
  if (typeof data.error === "string") return `Hmm, ${data.error.charAt(0).toLowerCase()}${data.error.slice(1)}`;

  switch (name) {
    case "search_items": {
      const count = Number(data.count ?? 0);
      const query = searchQuery(previousUser);
      const dates = data.dates && data.dates !== "any" ? ` for ${data.dates}` : "";
      const matched = typeof data.matched === "string" ? data.matched : "";
      if (count && matched.startsWith("category ")) {
        return `No exact "${query}" listed, but here ${count === 1 ? "is 1 item" : `are ${count} items`} in ${matched.slice(9)}${dates}. Tap a card to check dates.`;
      }
      if (!count) {
        return `Nothing on the shelf${query ? ` for "${query}"` : ""}${dates} right now. Try a broader word, or check back later. New things get listed every day.`;
      }
      return `Found ${count} ${count === 1 ? "match" : "matches"}${query ? ` for "${query}"` : ""}${dates}. Tap a card to check dates and send a request.`;
    }
    case "my_loans": {
      const loans = (data.loans as { title: string; due: string; role: string }[] | undefined) ?? [];
      if (!loans.length) return "You have no open loans right now. The shelf is all yours.";
      const next = loans[0];
      return `You have ${loans.length} open loan${loans.length === 1 ? "" : "s"}. Next up: **${next.title}** (${next.role}), ${next.due.toLowerCase()}.`;
    }
    case "my_requests": {
      const requests = (data.requests as unknown[] | undefined) ?? [];
      const incoming = Number(data.incoming_pending ?? 0);
      if (!requests.length) return "No requests in flight. Find something you need and I'll help you request it.";
      return incoming
        ? `${incoming} request${incoming === 1 ? " is" : "s are"} waiting for your decision. Here's the latest.`
        : "Here are your latest requests.";
    }
    case "my_fines": {
      const owed = Number(data.outstanding_inr ?? 0);
      return owed > 0
        ? `You have **₹${owed}** in pending fines. A campus admin settles or waives them on your Fines page.`
        : "You owe nothing. Clean ledger. Keep returning on time!";
    }
    case "my_unread": {
      const unread = Number(data.unread ?? 0);
      return unread ? `You have ${unread} unread notification${unread === 1 ? "" : "s"}.` : "You're all caught up.";
    }
    case "explain_policy": {
      const rule = String(data.text ?? raw).replace(/^[^:]+:\s*/, "");
      // Quick mode still does the arithmetic: "3 days late" → ₹60.
      const late = previousUser.toLowerCase().match(/(\d{1,3})\s*(?:days?|d)(?![a-z])/);
      if (late && /fine|late|overdue|charge|cost|owe|pay/.test(previousUser.toLowerCase())) {
        const days = Number(late[1]);
        const amount = Math.min(days * FINE_PER_DAY, MAX_FINE_PER_LOAN);
        return `**${days} day${days === 1 ? "" : "s"} late = ₹${amount}** (₹${FINE_PER_DAY} × ${days}${days * FINE_PER_DAY > MAX_FINE_PER_LOAN ? `, capped at ₹${MAX_FINE_PER_LOAN}` : ""}).

${rule}`;
      }
      return rule;
    }
    case "list_pickup_spots": {
      const spots = Array.isArray(data.text) ? (data.text as { name: string }[]) : [];
      return spots.length
        ? `Handovers happen at: ${spots.map((s) => s.name).join(", ")}.`
        : POLICY.pickup_spots.text;
    }
    case "propose_navigation":
    case "propose_request":
      return "Here you go.";
    default:
      return "Done.";
  }
}

export function localTopicFor(message: string): PolicyTopic | null {
  return matchPolicy(message);
}

export function createLocalProvider(): LLMProvider {
  return {
    id: "local",
    async *stream({ messages, signal }: LLMRequest): AsyncGenerator<LLMChunk> {
      const last = messages.at(-1);
      let text: string;
      if (last?.role === "tool") {
        const toolMessages: Extract<LLMMessage, { role: "tool" }>[] = [];
        for (let i = messages.length - 1; i >= 0 && messages[i].role === "tool"; i--) {
          toolMessages.unshift(messages[i] as Extract<LLMMessage, { role: "tool" }>);
        }
        const previousUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
        text = toolMessages.map((m) => summarise(m.name, m.content, previousUser)).join(" ");
      } else {
        const routed = routeIntent(last?.role === "user" ? last.content : "");
        if (Array.isArray(routed)) {
          yield { type: "tool_calls", calls: routed };
          return;
        }
        text = routed;
      }
      // Stream word by word so the UI (and Parcel's mouth) feel alive.
      const words = text.split(/(\s+)/);
      for (let i = 0; i < words.length; i += 4) {
        if (signal?.aborted) return;
        yield { type: "text", delta: words.slice(i, i + 4).join("") };
        await new Promise((resolve) => setTimeout(resolve, 28));
      }
    },
  };
}
