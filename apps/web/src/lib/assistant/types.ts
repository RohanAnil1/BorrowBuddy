/**
 * Wire contract between /api/assistant and the Buddy UI. Kept free of server
 * imports so client components (and later the Android app) can share it.
 */

export type AssistantItemCard = {
  id: string;
  title: string;
  image: string | null;
  condition: string;
  deposit: string;
  spot: string | null;
  trust: number;
  owner: string;
};

export type AssistantLoanCard = {
  id: string;
  title: string;
  role: "borrowing" | "lending";
  status: string;
  statusLabel: string;
  dueDate: string;
  dueLabel: string;
  tone: "ok" | "soon" | "late" | "done";
};

export type AssistantRequestCard = {
  id: string;
  itemId: string;
  title: string;
  direction: "incoming" | "outgoing";
  status: string;
  statusLabel: string;
  dates: string;
};

export type AssistantFineCard = {
  id: string;
  amount: string;
  reason: string;
  status: string;
  itemTitle: string | null;
  loanId: string | null;
};

export type AssistantCard =
  | { kind: "items"; title: string; items: AssistantItemCard[]; moreHref?: string }
  | { kind: "loans"; title: string; loans: AssistantLoanCard[] }
  | { kind: "requests"; title: string; requests: AssistantRequestCard[] }
  | { kind: "fines"; title: string; total: string; fines: AssistantFineCard[] }
  | {
      kind: "action";
      label: string;
      href: string;
      description?: string;
      variant: "navigate" | "request";
    };

export type AssistantMode = "ai" | "local";

export type AssistantEvent =
  | { type: "meta"; mode: AssistantMode; provider: string }
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; label: string }
  | { type: "card"; card: AssistantCard }
  | { type: "done" }
  | { type: "error"; message: string; code?: string };

export type AssistantTurn = { role: "user" | "assistant"; content: string };

export const ASSISTANT_LIMITS = {
  maxMessageChars: 1000,
  maxHistoryTurns: 12,
  maxToolSteps: 4,
  rateLimit: 20,
  rateWindowSeconds: 600,
} as const;
