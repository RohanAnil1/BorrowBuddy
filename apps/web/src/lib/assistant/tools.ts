import "server-only";
import { z } from "zod";
import type { Profile } from "@borrowbuddy/shared";
import { getFinesForUser, getOutstandingTotal } from "@/lib/data/fines";
import {
  getCategories,
  getItem,
  getItemAvailability,
  getPickupLocations,
  searchItems,
} from "@/lib/data/items";
import { getLoansForUser, isOpenLoan, isOverdue } from "@/lib/data/loans";
import { getUnreadCount } from "@/lib/data/notifications";
import { getIncomingRequests, getOutgoingRequests } from "@/lib/data/requests";
import { SPOTS } from "@/lib/campus-map";
import {
  conditionLabel,
  formatDate,
  formatDateRange,
  formatMoney,
  loanStatusLabel,
  requestStatusLabel,
} from "@/lib/format";
import { BUCKETS, publicUrl } from "@/lib/storage";
import { campusToday, POLICY, policyText, type PolicyTopic } from "./knowledge";
import type {
  AssistantCard,
  AssistantItemCard,
  AssistantLoanCard,
} from "./types";

export type ToolContext = { profile: Profile };
export type ToolOutcome = { result: unknown; card?: AssistantCard };

/** JSON-schema subset that both Gemini and Groq accept. */
export type ToolParameters = {
  type: "object";
  properties: Record<string, { type: "string" | "integer" | "boolean"; description: string; enum?: string[] }>;
  required?: string[];
};

export type AssistantTool = {
  name: string;
  description: string;
  label: string;
  parameters: ToolParameters;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolOutcome>;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const optionalDate = z
  .string()
  .regex(DATE)
  .optional()
  .catch(undefined);

/** User-written text is untrusted: trim it hard before it reaches the model. */
function clip(text: string | null | undefined, max = 160): string {
  const value = (text ?? "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Rough singular form, good enough for catalog keywords. */
function stem(word: string): string {
  const w = word.toLowerCase();
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

function toItemCard(item: Awaited<ReturnType<typeof searchItems>>[number]): AssistantItemCard {
  return {
    id: item.id,
    title: item.title,
    image: publicUrl(BUCKETS.itemImages, item.images[0]),
    condition: conditionLabel(item.condition),
    deposit: item.deposit_amount > 0 ? `DEP ${formatMoney(item.deposit_amount)}` : "NO DEPOSIT",
    spot: item.pickup_location?.name ?? null,
    trust: Math.round(item.owner?.trust_score ?? 0),
    owner: item.owner?.full_name ?? "Student",
  };
}

/* ------------------------------- route guard ------------------------------- */

const STATIC_ROUTES: Record<string, string> = {
  "/home": "Browse the catalog",
  "/dashboard": "Your dashboard",
  "/my/borrows": "Your borrows",
  "/my/items": "Your listings and incoming requests",
  "/items/new": "List a new item",
  "/fines": "Your fines",
  "/map": "Campus pickup map",
  "/chat": "Your chats",
  "/campus": "Campus hub",
  "/campus/lost-found": "Lost & Found",
  "/campus/giveaways": "Giveaway shelf",
  "/campus/activity": "Your campus activity",
  "/campus/handovers": "Handover appointments",
  "/notifications": "Notifications",
  "/me": "Your profile",
};

/** Only internal pages Buddy is allowed to send people to. */
export function safeInternalHref(target: string): { href: string; label: string } | null {
  let path: string;
  let search = "";
  try {
    const url = new URL(target, "https://buddy.local");
    if (url.origin !== "https://buddy.local") return null;
    path = url.pathname.replace(/\/+$/, "") || "/";
    search = url.search;
  } catch {
    return null;
  }
  if (STATIC_ROUTES[path]) {
    // Only the catalog accepts filters from Buddy.
    return { href: path === "/home" ? `${path}${search}` : path, label: STATIC_ROUTES[path] };
  }
  const dynamic = path.match(/^\/(items|loans|users)\/([^/]+)$/);
  if (dynamic && UUID.test(dynamic[2])) {
    const label = { items: "Open item", loans: "Open loan", users: "Open profile" }[dynamic[1]]!;
    return { href: path, label };
  }
  return null;
}

/* ---------------------------------- tools ---------------------------------- */

const searchArgs = z.object({
  query: z.string().max(80).optional().catch(undefined),
  category: z.string().max(60).optional().catch(undefined),
  start_date: optionalDate,
  end_date: optionalDate,
});

const TOOLS: AssistantTool[] = [
  {
    name: "search_items",
    label: "Searching the catalog",
    description:
      "Search items students are lending right now. Use for any 'find', 'need', 'borrow', 'is there a' question. Optional date range (YYYY-MM-DD, both or neither) hides items already booked for those dates.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Short keywords, e.g. 'calculator' or 'drafter'." },
        category: { type: "string", description: "Optional category name, e.g. 'Electronics'." },
        start_date: { type: "string", description: "First day needed, YYYY-MM-DD." },
        end_date: { type: "string", description: "Last day needed, YYYY-MM-DD." },
      },
    },
    async run(raw) {
      const args = searchArgs.parse(raw);
      const dates =
        args.start_date && args.end_date && args.start_date <= args.end_date
          ? { startDate: args.start_date, endDate: args.end_date }
          : {};
      let categoryId: string | undefined;
      if (args.category) {
        const wanted = args.category.toLowerCase();
        const categories = await getCategories();
        categoryId = categories.find(
          (c) => c.name.toLowerCase() === wanted || c.slug === wanted || c.name.toLowerCase().includes(wanted),
        )?.id;
      }
      let query = args.query?.trim();
      let items = await searchItems({ q: query, categoryId, limit: 8, ...dates });
      let matchedBy: "text" | "category" = "text";
      // Free models over-specify ("ti-84 graphing calculator"): retry on the
      // strongest word, singularised ("laptops" → "laptop").
      if (items.length === 0 && query) {
        const word = stem(query.split(/\s+/).sort((a, b) => b.length - a.length)[0]);
        if (word !== query) {
          items = await searchItems({ q: word, categoryId, limit: 8, ...dates });
          if (items.length) query = word;
        }
        // Still nothing: the word may name a category ("camera" → Cameras & Audio).
        if (items.length === 0 && !categoryId && word.length >= 3) {
          const categories = await getCategories();
          const hit = categories.find((c) =>
            c.name
              .toLowerCase()
              .split(/[^a-z]+/)
              .some((part) => part.length >= 3 && (stem(part).startsWith(word) || word.startsWith(stem(part)))),
          );
          if (hit) {
            items = await searchItems({ categoryId: hit.id, limit: 8, ...dates });
            categoryId = hit.id;
            matchedBy = "category";
            query = hit.name;
          }
        }
      }
      const params = new URLSearchParams();
      if (query && matchedBy === "text") params.set("q", query);
      if (categoryId) params.set("category", categoryId);
      if (dates.startDate) params.set("from", dates.startDate);
      if (dates.endDate) params.set("to", dates.endDate);
      const cards = items.slice(0, 6).map(toItemCard);
      return {
        result: {
          count: items.length,
          matched: matchedBy === "category" ? `category ${query}` : (query ?? "everything"),
          dates: dates.startDate ? `${dates.startDate} to ${dates.endDate}` : "any",
          items: items.slice(0, 6).map((item) => ({
            id: item.id,
            title: clip(item.title, 80),
            condition: item.condition,
            deposit_inr: item.deposit_amount,
            max_loan_days: item.max_loan_days,
            pickup_spot: item.pickup_location?.name ?? null,
            owner_trust: Math.round(item.owner?.trust_score ?? 0),
            description: clip(item.description, 120),
          })),
        },
        card: cards.length
          ? {
              kind: "items",
              title: query ? `On the shelf: ${query}` : "On the shelf",
              items: cards,
              moreHref: `/home${params.size ? `?${params}` : ""}`,
            }
          : undefined,
      };
    },
  },
  {
    name: "get_item",
    label: "Checking that item",
    description: "Get one item's details and its booked date ranges. Needs the item id from search_items.",
    parameters: {
      type: "object",
      properties: { item_id: { type: "string", description: "The item's id." } },
      required: ["item_id"],
    },
    async run(raw) {
      const id = String(raw.item_id ?? "");
      if (!UUID.test(id)) return { result: { error: "Unknown item id." } };
      const item = await getItem(id);
      if (!item) return { result: { error: "Item not found." } };
      const windows = await getItemAvailability(id).catch(() => []);
      return {
        result: {
          id: item.id,
          title: clip(item.title, 80),
          status: item.status,
          condition: item.condition,
          deposit_inr: item.deposit_amount,
          max_loan_days: item.max_loan_days,
          pickup_spot: item.pickup_location?.name ?? null,
          owner: item.owner?.full_name,
          owner_trust: Math.round(item.owner?.trust_score ?? 0),
          description: clip(item.description, 240),
          booked_ranges: windows.map((w) => `${w.start_date} to ${w.end_date}`),
        },
        card: { kind: "items", title: "Item", items: [toItemCard(item)] },
      };
    },
  },
  {
    name: "list_categories",
    label: "Reading the categories",
    description: "List the catalog categories.",
    parameters: { type: "object", properties: {} },
    async run() {
      const categories = await getCategories();
      return { result: categories.map((c) => c.name) };
    },
  },
  {
    name: "list_pickup_spots",
    label: "Opening the campus map",
    description: "List the campus pickup spots where handovers happen.",
    parameters: { type: "object", properties: {} },
    async run() {
      const live = await getPickupLocations().catch(() => []);
      const spots = live.length
        ? live.map((spot) => ({ name: spot.name, where: clip(spot.description, 100) }))
        : SPOTS.map((spot) => ({ name: spot.name, where: clip(spot.description, 100) }));
      return {
        result: spots,
        card: { kind: "action", variant: "navigate", label: "Open the campus map", href: "/map" },
      };
    },
  },
  {
    name: "my_loans",
    label: "Checking your loans",
    description: "The signed-in student's current loans (borrowing and lending) with due dates.",
    parameters: {
      type: "object",
      properties: {
        include_past: { type: "boolean", description: "Also include finished loans." },
      },
    },
    async run(raw, { profile }) {
      const { asBorrower, asOwner } = await getLoansForUser(profile.id);
      const today = campusToday().iso;
      const includePast = raw.include_past === true;
      const rows = [
        ...asBorrower.map((loan) => ({ loan, role: "borrowing" as const })),
        ...asOwner.map((loan) => ({ loan, role: "lending" as const })),
      ]
        .filter(({ loan }) => includePast || isOpenLoan(loan.status))
        .sort((a, b) => a.loan.due_date.localeCompare(b.loan.due_date))
        .slice(0, 8);
      const cards: AssistantLoanCard[] = rows.map(({ loan, role }) => {
        const days = daysBetween(today, loan.due_date);
        const open = isOpenLoan(loan.status);
        const late = open && (isOverdue(loan) || days < 0);
        return {
          id: loan.id,
          title: loan.item?.title ?? "Item",
          role,
          status: loan.status,
          statusLabel: loanStatusLabel(loan.status),
          dueDate: loan.due_date,
          dueLabel: !open
            ? formatDate(loan.due_date)
            : late
              ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} late`
              : days === 0
                ? "Due today"
                : `Due in ${days} day${days === 1 ? "" : "s"}`,
          tone: !open ? "done" : late ? "late" : days <= 1 ? "soon" : "ok",
        };
      });
      return {
        result: {
          today,
          loans: cards.map((c) => ({
            title: clip(c.title, 80),
            role: c.role,
            status: c.statusLabel,
            due_date: c.dueDate,
            due: c.dueLabel,
          })),
        },
        card: cards.length ? { kind: "loans", title: "Your loans", loans: cards } : undefined,
      };
    },
  },
  {
    name: "my_requests",
    label: "Checking your requests",
    description:
      "The signed-in student's borrow requests: ones they sent (outgoing) and ones waiting on their own items (incoming).",
    parameters: { type: "object", properties: {} },
    async run(_raw, { profile }) {
      const [incoming, outgoing] = await Promise.all([
        getIncomingRequests(profile.id),
        getOutgoingRequests(profile.id),
      ]);
      const pick = [
        ...incoming.filter((r) => r.status === "pending").map((r) => ({ r, direction: "incoming" as const })),
        ...outgoing.slice(0, 6).map((r) => ({ r, direction: "outgoing" as const })),
      ].slice(0, 8);
      const requests = pick.map(({ r, direction }) => ({
        id: r.id,
        itemId: r.item_id,
        title: r.item?.title ?? "Item",
        direction,
        status: r.status,
        statusLabel: requestStatusLabel(r.status),
        dates: formatDateRange(r.start_date, r.end_date),
      }));
      return {
        result: {
          incoming_pending: incoming.filter((r) => r.status === "pending").length,
          requests: requests.map((r) => ({
            title: clip(r.title, 80),
            direction: r.direction,
            status: r.statusLabel,
            dates: r.dates,
          })),
        },
        card: requests.length ? { kind: "requests", title: "Your requests", requests } : undefined,
      };
    },
  },
  {
    name: "my_fines",
    label: "Opening your ledger",
    description: "The signed-in student's fines and outstanding total.",
    parameters: { type: "object", properties: {} },
    async run(_raw, { profile }) {
      const [fines, total] = await Promise.all([getFinesForUser(profile.id), getOutstandingTotal(profile.id)]);
      const rows = fines.slice(0, 6).map((fine) => ({
        id: fine.id,
        amount: `₹${fine.amount}`,
        reason: clip(fine.reason, 90),
        status: fine.status,
        itemTitle: fine.loan?.item_title ?? null,
        loanId: fine.loan?.id ?? null,
      }));
      return {
        result: {
          outstanding_inr: total,
          fines: rows.map((r) => ({ amount: r.amount, reason: r.reason, status: r.status, item: r.itemTitle })),
        },
        card: {
          kind: "fines",
          title: "Your fines",
          total: total > 0 ? `₹${total}` : "₹0",
          fines: rows,
        },
      };
    },
  },
  {
    name: "my_unread",
    label: "Checking notifications",
    description: "How many unread notifications the signed-in student has.",
    parameters: { type: "object", properties: {} },
    async run(_raw, { profile }) {
      const unread = await getUnreadCount(profile.id);
      return {
        result: { unread },
        card: unread
          ? { kind: "action", variant: "navigate", label: `Open ${unread} notification${unread === 1 ? "" : "s"}`, href: "/notifications" }
          : undefined,
      };
    },
  },
  {
    name: "explain_policy",
    label: "Reading the rulebook",
    description: "Official BorrowBuddy rules for a topic. Always use this before answering policy questions.",
    parameters: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "The topic.",
          enum: Object.keys(POLICY),
        },
      },
      required: ["topic"],
    },
    async run(raw) {
      const topic = String(raw.topic ?? "") as PolicyTopic;
      if (!POLICY[topic]) return { result: { error: "Unknown topic." } };
      return { result: policyText(topic) };
    },
  },
  {
    name: "propose_navigation",
    label: "Finding the right page",
    description:
      "Offer the student a button to open a BorrowBuddy page. Allowed: /home (optionally ?q=), /dashboard, /my/borrows, /my/items, /items/new, /fines, /map, /chat, /campus, /campus/lost-found, /campus/giveaways, /campus/activity, /campus/handovers, /notifications, /me, /items/{id}, /loans/{id}.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Internal path, e.g. /map." },
        label: { type: "string", description: "Short button text, e.g. 'Open the map'." },
      },
      required: ["path"],
    },
    async run(raw) {
      const target = safeInternalHref(String(raw.path ?? ""));
      if (!target) return { result: { error: "That page isn't available. Offer a listed page instead." } };
      const label = clip(typeof raw.label === "string" && raw.label ? raw.label : target.label, 40);
      return {
        result: { ok: true, shown_button: label },
        card: { kind: "action", variant: "navigate", label, href: target.href },
      };
    },
  },
  {
    name: "propose_request",
    label: "Preparing your request",
    description:
      "Offer a button that opens an item's request form with dates prefilled. The student reviews and sends it themselves. Needs item_id from search_items and dates YYYY-MM-DD.",
    parameters: {
      type: "object",
      properties: {
        item_id: { type: "string", description: "The item's id." },
        start_date: { type: "string", description: "YYYY-MM-DD" },
        end_date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["item_id", "start_date", "end_date"],
    },
    async run(raw) {
      const id = String(raw.item_id ?? "");
      const start = String(raw.start_date ?? "");
      const end = String(raw.end_date ?? "");
      if (!UUID.test(id) || !DATE.test(start) || !DATE.test(end) || start > end) {
        return { result: { error: "Need a valid item id and a start date on or before the end date." } };
      }
      const item = await getItem(id);
      if (!item) return { result: { error: "Item not found." } };
      const length = daysBetween(start, end) + 1;
      if (length > item.max_loan_days) {
        return { result: { error: `This item lends for at most ${item.max_loan_days} days.` } };
      }
      return {
        result: { ok: true, note: "Button shown; the student confirms on the item page." },
        card: {
          kind: "action",
          variant: "request",
          label: `Request ${clip(item.title, 28)}`,
          description: `${formatDateRange(start, end)} · ${length} day${length === 1 ? "" : "s"} · deposit ${formatMoney(item.deposit_amount)}`,
          href: `/items/${id}?start=${start}&end=${end}`,
        },
      };
    },
  },
];

export const ASSISTANT_TOOLS = TOOLS;

export function findTool(name: string): AssistantTool | undefined {
  return TOOLS.find((tool) => tool.name === name);
}

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const tool = findTool(name);
  if (!tool) return { result: { error: `No tool called ${name}.` } };
  try {
    return await tool.run(args ?? {}, ctx);
  } catch (error) {
    console.error(`[assistant] tool ${name} failed:`, error);
    return { result: { error: "That lookup failed. Tell the student to try again shortly." } };
  }
}
