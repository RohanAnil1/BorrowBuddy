"use client";

import { Archive, BellOff, Globe, Lock, Megaphone, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { ConversationSummary } from "@/lib/data/chat";
import { initials, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const filters = ["All", "Unread", "Groups", "Loans"] as const;
type Filter = (typeof filters)[number];

function GroupIcon({ row }: { row: ConversationSummary }) {
  if (row.archived) return <Archive aria-hidden="true" size={15} />;
  if (row.posting === "admins") return <Megaphone aria-hidden="true" size={15} />;
  if (row.visibility === "invite") return <Lock aria-hidden="true" size={14} />;
  return <Globe aria-hidden="true" size={15} />;
}

function Row({ row, selected }: { row: ConversationSummary; selected: boolean }) {
  const community = row.type === "community";
  const unread = row.unreadCount > 0 && !selected;
  return (
    <li>
      <Link aria-current={selected ? "page" : undefined} className="chat-directory-row" href={`/chat/${row.id}`}>
        <span className={cn("chat-channel-icon", community && "chat-channel-public")}>
          {community ? <GroupIcon row={row} /> : initials(row.title)}
        </span>
        <span className="chat-directory-copy">
          <span className="chat-directory-title">
            {row.title}
            {community && <span className="chat-kind">{row.visibility === "invite" ? "Private" : "Public"}</span>}
          </span>
          <span className="chat-directory-preview">
            {row.isMember
              ? row.lastMessage || (community ? "Say hello to the group" : "Plan your pickup or return")
              : row.subtitle}
          </span>
        </span>
        <span className="chat-directory-meta">
          <span>{row.isMember && row.lastMessageAt ? relativeTime(row.lastMessageAt) : ""}</span>
          {row.muted && <BellOff className="chat-muted-icon" aria-label="Muted" size={13} />}
          {unread && (
            <span className="chat-unread-count" aria-label={`${row.unreadCount >= 100 ? "99+" : row.unreadCount} unread`}>
              {row.unreadCount >= 100 ? "99+" : row.unreadCount}
            </span>
          )}
          {!row.isMember && <span className="chat-join-hint">Join</span>}
        </span>
      </Link>
    </li>
  );
}

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
    if (filter === "Groups" && row.type !== "community") return false;
    if (filter === "Loans" && row.type !== "private") return false;
    return `${row.title} ${row.lastMessage ?? ""}`.toLowerCase().includes(term);
  });
  const mine = matches.filter((row) => row.isMember);
  const joinable = matches.filter((row) => !row.isMember);

  return (
    <section aria-label="Conversations" className="chat-directory">
      <header className="chat-directory-tools">
        <div className="chat-directory-heading">
          {activeId ? <h2>Messages</h2> : <h1>Messages</h1>}
          {unread > 0 && <span>{unread} unread {unread === 1 ? "chat" : "chats"}</span>}
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
        <>
          {mine.length > 0 && (
            <ol className="chat-directory-list">
              {mine.map((row) => <Row key={row.id} row={row} selected={row.id === activeId} />)}
            </ol>
          )}
          {joinable.length > 0 && (
            <>
              <h3 className="chat-directory-section">Groups you can join</h3>
              <ol className="chat-directory-list">
                {joinable.map((row) => <Row key={row.id} row={row} selected={row.id === activeId} />)}
              </ol>
            </>
          )}
        </>
      ) : (
        <div className="chat-empty">
          <strong>{conversations.length ? (filter === "Unread" && !term ? "You’re caught up" : "No matching conversations") : "No conversations yet"}</strong>
          <p>{conversations.length ? "Try another search or choose a different filter." : "An approved loan opens a private chat for pickup and return."}</p>
        </div>
      )}
    </section>
  );
}
