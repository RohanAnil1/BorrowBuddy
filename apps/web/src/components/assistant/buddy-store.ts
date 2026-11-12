"use client";

import { useSyncExternalStore } from "react";
import type { AssistantCard, AssistantEvent, AssistantMode } from "@/lib/assistant/types";
import { ASSISTANT_LIMITS } from "@/lib/assistant/types";
import type { ParcelMood } from "./mascot/parcel";

/**
 * One conversation store shared by the floating panel and the /assistant
 * page. Lives outside React so both surfaces stay in sync and streaming
 * survives route changes. History persists per student in localStorage.
 */

export type BuddyMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  cards: AssistantCard[];
  tools: string[];
  state: "streaming" | "done" | "error";
  error?: string;
  /** "sleepy" when Buddy is rate-limited, so the avatar naps instead of frowning. */
  errorMood?: ParcelMood;
  at: number;
};

export type BuddyConversation = { id: string; title: string; updatedAt: number; messages: BuddyMessage[] };

export type BuddyState = {
  hydrated: boolean;
  userId: string | null;
  conversations: BuddyConversation[];
  activeId: string | null;
  open: boolean;
  busy: boolean;
  mood: ParcelMood;
  mode: AssistantMode | null;
  cooldownUntil: number;
  online: boolean;
};

const MAX_CONVERSATIONS = 20;
const MAX_MESSAGES = 60;

const initial: BuddyState = {
  hydrated: false,
  userId: null,
  conversations: [],
  activeId: null,
  open: false,
  busy: false,
  mood: "idle",
  mode: null,
  cooldownUntil: 0,
  online: true,
};

let state: BuddyState = initial;
const listeners = new Set<() => void>();
let controller: AbortController | null = null;
let moodTimer: number | undefined;
let persistTimer: number | undefined;

function set(patch: Partial<BuddyState> | ((s: BuddyState) => Partial<BuddyState>)) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  listeners.forEach((listener) => listener());
}

const storageKey = (userId: string) => `borrowbuddy.buddy.v1.${userId}`;

function persist() {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    if (!state.userId) return;
    try {
      const conversations = state.conversations.slice(0, MAX_CONVERSATIONS).map((c) => ({
        ...c,
        messages: c.messages.slice(-MAX_MESSAGES).map((m) => (m.state === "streaming" ? { ...m, state: "done" as const } : m)),
      }));
      localStorage.setItem(storageKey(state.userId), JSON.stringify({ conversations, activeId: state.activeId }));
    } catch {
      // Private mode or quota: Buddy still works, it just forgets on reload.
    }
  }, 350);
}

function setMood(mood: ParcelMood, thenIdleAfter?: number) {
  window.clearTimeout(moodTimer);
  set({ mood });
  if (thenIdleAfter) {
    moodTimer = window.setTimeout(() => set((s) => ({ mood: s.online ? "idle" : "offline" })), thenIdleAfter);
  }
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

function updateConversation(id: string, update: (c: BuddyConversation) => BuddyConversation) {
  set((s) => ({
    conversations: s.conversations
      .map((c) => (c.id === id ? update(c) : c))
      .sort((a, b) => b.updatedAt - a.updatedAt),
  }));
}

function updateMessage(conversationId: string, messageId: string, update: (m: BuddyMessage) => BuddyMessage) {
  updateConversation(conversationId, (c) => ({
    ...c,
    updatedAt: Date.now(),
    messages: c.messages.map((m) => (m.id === messageId ? update(m) : m)),
  }));
}

export const buddy = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: () => state,

  init(userId: string) {
    if (state.userId === userId && state.hydrated) return () => {};
    let saved: { conversations?: BuddyConversation[]; activeId?: string | null } = {};
    try {
      saved = JSON.parse(localStorage.getItem(storageKey(userId)) ?? "{}");
    } catch {
      saved = {};
    }
    const conversations = Array.isArray(saved.conversations) ? saved.conversations : [];
    set({
      hydrated: true,
      userId,
      conversations,
      activeId: conversations.some((c) => c.id === saved.activeId) ? saved.activeId! : (conversations[0]?.id ?? null),
      online: navigator.onLine,
      mood: navigator.onLine ? "idle" : "offline",
    });
    const online = () => {
      set({ online: true });
      setMood("happy", 1500);
    };
    const offline = () => {
      set({ online: false });
      setMood("offline");
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  },

  setOpen(open: boolean) {
    set({ open });
    if (open && !state.busy) setMood("wave", 1600);
  },

  poke(mood: ParcelMood, ms = 1400) {
    if (!state.busy) setMood(mood, ms);
  },

  newConversation() {
    if (state.busy) buddy.stop();
    set({ activeId: null });
    setMood("wave", 1400);
    persist();
  },

  select(id: string) {
    if (state.busy) buddy.stop();
    set({ activeId: id });
    persist();
  },

  remove(id: string) {
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      activeId: s.activeId === id ? null : s.activeId,
    }));
    persist();
  },

  stop() {
    controller?.abort();
    controller = null;
  },

  async send(rawText: string, path: string) {
    const text = rawText.trim().slice(0, ASSISTANT_LIMITS.maxMessageChars);
    if (!text || state.busy) return;
    if (Date.now() < state.cooldownUntil) {
      setMood("sleepy");
      return;
    }

    let conversationId = state.activeId;
    if (!conversationId || !state.conversations.some((c) => c.id === conversationId)) {
      conversationId = uid();
      const conversation: BuddyConversation = {
        id: conversationId,
        title: text.slice(0, 48),
        updatedAt: Date.now(),
        messages: [],
      };
      set((s) => ({ conversations: [conversation, ...s.conversations], activeId: conversationId }));
    }

    const prior = state.conversations.find((c) => c.id === conversationId)?.messages ?? [];
    const history = [
      ...prior
        .filter((m) => m.state !== "error" && m.text.trim())
        .map((m) => ({ role: m.role, content: m.text })),
      { role: "user" as const, content: text },
    ].slice(-ASSISTANT_LIMITS.maxHistoryTurns);

    const userMessage: BuddyMessage = { id: uid(), role: "user", text, cards: [], tools: [], state: "done", at: Date.now() };
    const reply: BuddyMessage = { id: uid(), role: "assistant", text: "", cards: [], tools: [], state: "streaming", at: Date.now() };
    const convoId = conversationId;
    updateConversation(convoId, (c) => ({
      ...c,
      updatedAt: Date.now(),
      messages: [...c.messages, userMessage, reply].slice(-MAX_MESSAGES),
    }));
    set({ busy: true });
    setMood("thinking");

    const abort = new AbortController();
    controller = abort;
    const fail = (message: string, mood: ParcelMood = "confused") => {
      updateMessage(convoId, reply.id, (m) => ({ ...m, state: "error", error: message, errorMood: mood }));
      setMood(mood, mood === "sleepy" ? undefined : 4200);
    };

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history, path }),
        signal: abort.signal,
      });

      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => ({}))) as { error?: string; retryAfter?: number };
        if (response.status === 429) {
          const wait = Math.max(5, body.retryAfter ?? 60);
          set({ cooldownUntil: Date.now() + wait * 1000 });
          window.setTimeout(() => set((s) => (s.mood === "sleepy" ? { mood: "idle" } : {})), wait * 1000);
          fail(`${body.error ?? "Buddy needs a breather."} Try again in ${wait < 90 ? `${wait}s` : `${Math.ceil(wait / 60)} min`}.`, "sleepy");
        } else {
          fail(body.error ?? "Buddy couldn't answer that. Try again.");
        }
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          let event: AssistantEvent;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          switch (event.type) {
            case "meta":
              set({ mode: event.mode });
              break;
            case "text":
              if (state.mood !== "talking" && state.mood !== "found") setMood("talking");
              updateMessage(convoId, reply.id, (m) => ({ ...m, text: m.text + event.delta }));
              break;
            case "tool":
              setMood("thinking");
              updateMessage(convoId, reply.id, (m) => ({ ...m, tools: [...m.tools, event.label] }));
              break;
            case "card":
              if (event.card.kind === "items" || event.card.kind === "action") setMood("found");
              updateMessage(convoId, reply.id, (m) => ({ ...m, cards: [...m.cards, event.card] }));
              break;
            case "error":
              finished = true;
              fail(event.message);
              break;
            case "done":
              finished = true;
              updateMessage(convoId, reply.id, (m) => ({ ...m, state: "done" }));
              setMood("happy", 1800);
              break;
          }
        }
      }
      if (!finished) fail("The answer got cut off. Try again.");
    } catch {
      if (abort.signal.aborted) {
        updateMessage(convoId, reply.id, (m) => ({
          ...m,
          state: m.text ? "done" : "error",
          error: m.text ? undefined : "Stopped.",
        }));
        setMood("idle");
      } else {
        fail(navigator.onLine ? "Buddy lost the signal. Try again." : "You're offline. Reconnect and try again.", navigator.onLine ? "confused" : "offline");
      }
    } finally {
      if (controller === abort) controller = null;
      set({ busy: false });
      persist();
    }
  },

  /** Re-asks the last question after an error. */
  retry(path: string) {
    const conversation = state.conversations.find((c) => c.id === state.activeId);
    if (!conversation || state.busy) return;
    const lastUser = [...conversation.messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    const cut = conversation.messages.lastIndexOf(lastUser);
    updateConversation(conversation.id, (c) => ({ ...c, messages: c.messages.slice(0, cut) }));
    void buddy.send(lastUser.text, path);
  },
};

const serverSnapshot = () => initial;

export function useBuddy(): BuddyState {
  return useSyncExternalStore(buddy.subscribe, buddy.get, serverSnapshot);
}

export function useActiveConversation(): BuddyConversation | null {
  const s = useBuddy();
  return s.conversations.find((c) => c.id === s.activeId) ?? null;
}
