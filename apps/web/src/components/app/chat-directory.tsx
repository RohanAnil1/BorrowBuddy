"use client";

import { Hash, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { ConversationSummary } from "@/lib/data/chat";
import { initials, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const filters = ["All", "Unread", "Public", "Private"] as const;
type Filter = (typeof filters)[number];

export function ChatDirectory({ conversations, activeId }: {
  conversations: ConversationSummary[];
  activeId?: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const term = query.trim().toLowerCase();
  const unread = conversations.filter((row) => row.unread && row.id !== activeId).length;
  const matches = conversations.filter((row) => {
    if (filter === "Unread" && (!row.unread || row.id === activeId)) return false;
    if (filter === "Public" && row.type !== "community") return false;
    if (filter === "Private" && row.type !== "private") return false;
    return `${row.title} ${row.lastMessage ?? ""}`.toLowerCase().includes(term);
  });

  return (
    <section aria-label="Conversations" className="chat-directory">
      <header className="chat-directory-tools">
        <div className="chat-directory-heading">
          {activeId ? <h2>Messages</h2> : <h1>Messages</h1>}
          {unread > 0 && <span>{unread} unread</span>}
        </div>
        <label className="chat-search">
          <Search aria-hidden="true" size={17} />
          <input type="search" aria-label="Search conversations" placeholder="Search conversations" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="chat-filters" role="group" aria-label="Filter conversations">
          {filters.map((name) => (
            <button key={name} type="button" aria-pressed={filter === name} onClick={() => setFilter(name)}>{name}</button>
          ))}
        </div>
      </header>
      {matches.length ? (
        <ol className="chat-directory-list">
          {matches.map((row) => {
            const community = row.type === "community";
            const selected = row.id === activeId;
            return (
              <li key={row.id}>
                <Link aria-current={selected ? "page" : undefined} className="chat-directory-row" href={`/chat/${row.id}`}>
                  <span className={cn("chat-channel-icon", community && "chat-channel-public")}>
                    {community ? <Hash aria-hidden="true" size={16} /> : initials(row.title)}
                  </span>
                  <span className="chat-directory-copy">
                    <span className="chat-directory-title">{row.title}</span>
                    <span className="chat-directory-preview">{row.lastMessage || (community ? "Start a campus conversation" : "Plan your pickup or return")}</span>
                  </span>
                  <span className="chat-directory-meta">
                    <span>{row.lastMessageAt ? relativeTime(row.lastMessageAt) : ""}</span>
                    {row.unread && !selected && <span className="chat-unread" aria-label="Unread" />}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="chat-empty">
          <strong>{conversations.length ? (filter === "Unread" && !term ? "You’re caught up" : "No matching conversations") : "No conversations yet"}</strong>
          <p>{conversations.length ? "Try another search or choose a different filter." : "An approved loan opens a private chat for pickup and return."}</p>
        </div>
      )}
    </section>
  );
}
