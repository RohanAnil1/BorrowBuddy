import { ArrowLeft, ArrowUpRight, Hash, Lock, Package, Star } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageThread } from "@/components/app/message-thread";
import { ChatDirectory } from "@/components/app/chat-directory";
import { loanStatusLabel } from "@/lib/format";
import { requireVerified } from "@/lib/auth/guards";
import { getConversation, getConversationCounterpart, getConversations, getThreadMessages } from "@/lib/data/chat";
import { getLoan } from "@/lib/data/loans";

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

  const [messages, counterpart, loan, conversations] = await Promise.all([
    getThreadMessages(id),
    conversation.type === "private"
      ? getConversationCounterpart(id, profile.id)
      : Promise.resolve(null),
    conversation.loan_id ? getLoan(conversation.loan_id) : Promise.resolve(null),
    getConversations(profile.id),
  ]);

  const title =
    conversation.type === "community"
      ? (conversation.title ?? "Community")
      : (counterpart?.full_name ?? "Loan chat");

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
        isCommunity={conversation.type === "community"}
        identity={
          <>
            <Link aria-label="Back to chats" className="chat-icon-button chat-back" href="/chat">
              <ArrowLeft size={19} aria-hidden="true" />
            </Link>
            <div className="chat-thread-identity">
              <h1>{title}</h1>
              <p className="chat-channel-label">
                {conversation.type === "community" ? <Hash size={12} aria-hidden="true" /> : <Lock size={11} aria-hidden="true" />}
                {conversation.type === "community" ? "Community channel" : "Private loan channel"}
              </p>
            </div>
            {counterpart && (
              <Link aria-label={`Open counterparty profile, trust score ${Math.round(counterpart.trust_score)}`} className="chat-trust" href={`/users/${counterpart.id}`}>
                <Star size={14} aria-hidden="true" /> {Math.round(counterpart.trust_score)}
              </Link>
            )}
          </>
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
