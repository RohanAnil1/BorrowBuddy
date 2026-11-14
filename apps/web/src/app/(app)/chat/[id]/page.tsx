import { Archive, ArrowLeft, ArrowUpRight, Hash, Lock, Package, Settings, Star, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageThread } from "@/components/app/message-thread";
import { ChatDirectory } from "@/components/app/chat-directory";
import { SubmitButton } from "@/components/app/submit-button";
import { initials, loanStatusLabel } from "@/lib/format";
import { requireVerified } from "@/lib/auth/guards";
import {
  getConversation,
  getConversationCounterpart,
  getConversations,
  getGroupMembers,
  getThreadMessages,
  groupSubtitle,
} from "@/lib/data/chat";
import { getLoan } from "@/lib/data/loans";
import { joinGroup, leaveGroup } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conversation = await getConversation(id);
  return { title: conversation?.title ?? "Chat" };
}

export default async function ChatThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireVerified();
  const { id } = await params;

  const conversation = await getConversation(id);
  if (!conversation) notFound();
  const group = conversation.type === "community";

  const [messages, counterpart, loan, conversations, members] = await Promise.all([
    getThreadMessages(id),
    group ? Promise.resolve(null) : getConversationCounterpart(id, profile.id),
    conversation.loan_id ? getLoan(conversation.loan_id) : Promise.resolve(null),
    getConversations(profile.id),
    group ? getGroupMembers(id) : Promise.resolve([]),
  ]);

  const isMember = group ? members.some((member) => member.user_id === profile.id) : true;
  const archived = Boolean(conversation.archived_at);
  const canPost = isMember && !archived;
  const canJoin = group && !isMember && !archived && (conversation.visibility === "open" || profile.is_admin);
  const title = group ? (conversation.title ?? "Group") : (counterpart?.full_name ?? "Loan chat");
  const subtitle = group
    ? groupSubtitle({ ...conversation, member_count: members.length })
    : "Private loan channel";

  const joinForm = (label: string) => (
    <form action={joinGroup}>
      <input name="group_id" type="hidden" value={conversation.id} />
      <SubmitButton pendingLabel="Joining…">{label}</SubmitButton>
    </form>
  );

  return (
    <section className="chat-workspace chat-workspace-thread">
      <aside className="chat-sidebar" aria-label="Chat navigation">
        <ChatDirectory activeId={conversation.id} conversations={conversations} />
      </aside>
      <MessageThread
        key={conversation.id}
        conversationId={conversation.id}
        currentUserId={profile.id}
        initialMessages={messages}
        isCommunity={group}
        isAdmin={profile.is_admin}
        canPost={canPost}
        trackRead={isMember}
        identity={
          <>
            <Link aria-label="Back to chats" className="chat-icon-button chat-back" href="/chat">
              <ArrowLeft size={19} aria-hidden="true" />
            </Link>
            <div className="chat-thread-identity">
              <h1>{title}</h1>
              <p className="chat-channel-label">
                {group
                  ? archived ? <Archive size={12} aria-hidden="true" />
                    : conversation.visibility === "invite" ? <Lock size={11} aria-hidden="true" /> : <Hash size={12} aria-hidden="true" />
                  : <Lock size={11} aria-hidden="true" />}
                {subtitle}
              </p>
            </div>
            {group && profile.is_admin && (
              <Link aria-label="Manage this group" title="Manage this group" className="chat-icon-button" href={`/admin/groups/${conversation.id}`}>
                <Settings size={18} aria-hidden="true" />
              </Link>
            )}
            {counterpart && (
              <Link aria-label={`Open counterparty profile, trust score ${Math.round(counterpart.trust_score)}`} className="chat-trust" href={`/users/${counterpart.id}`}>
                <Star size={14} aria-hidden="true" /> {Math.round(counterpart.trust_score)}
              </Link>
            )}
          </>
        }
        groupInfo={group && (
          <div className="chat-group-info">
            {conversation.description && <p className="chat-group-description">{conversation.description}</p>}
            <div className="chat-group-row">
              <details className="chat-members">
                <summary><Users size={14} aria-hidden="true" /> {members.length} {members.length === 1 ? "member" : "members"}</summary>
                <ul>
                  {members.map((member) => (
                    <li key={member.user_id}>
                      <Link href={`/users/${member.user_id}`}>
                        <span className="chat-channel-icon" aria-hidden="true">{initials(member.full_name || "?")}</span>
                        <span>{member.user_id === profile.id ? "You" : member.full_name || "Campus member"}{member.is_admin ? " · admin" : ""}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
              {isMember && (
                <form action={leaveGroup}>
                  <input name="group_id" type="hidden" value={conversation.id} />
                  <button className="chat-text-action" type="submit">Leave group</button>
                </form>
              )}
            </div>
          </div>
        )}
        closedComposer={
          archived ? (
            <p className="chat-closed-note"><Archive size={14} aria-hidden="true" /> This group is archived. You can read the history, but nobody can post.</p>
          ) : canJoin ? (
            <div className="chat-closed-join">
              <p>{conversation.visibility === "invite" ? "You can read this invite-only group as an admin. Join to post." : "You’re previewing this group. Join to post, react and get unread counts."}</p>
              {joinForm("Join group")}
            </div>
          ) : (
            <p className="chat-closed-note"><Lock size={14} aria-hidden="true" /> Only members can post here.</p>
          )
        }
        loanContext={loan && (
          <Link className="chat-loan-link" href={`/loans/${loan.id}`}>
            <Package size={16} aria-hidden="true" />
            <span className="chat-loan-title">{loan.item?.title ?? "Loan details"}</span>
            <span className="chat-loan-meta">{loanStatusLabel(loan.status)} · Due {loan.due_date}</span>
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        )}
      />
    </section>
  );
}
