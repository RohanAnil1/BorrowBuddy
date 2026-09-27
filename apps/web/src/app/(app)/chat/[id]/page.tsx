import { ArrowLeft, Star } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageThread } from "@/components/app/message-thread";
import { StatusBadge, loanTone } from "@/components/app/status-badge";
import { loanStatusLabel } from "@/lib/format";
import { requireVerified } from "@/lib/auth/guards";
import { getConversation, getConversationCounterpart, getThreadMessages } from "@/lib/data/chat";
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

  const [messages, counterpart, loan] = await Promise.all([
    getThreadMessages(id),
    conversation.type === "private"
      ? getConversationCounterpart(id, profile.id)
      : Promise.resolve(null),
    conversation.loan_id ? getLoan(conversation.loan_id) : Promise.resolve(null),
  ]);

  const title =
    conversation.type === "community"
      ? (conversation.title ?? "Community")
      : (counterpart?.full_name ?? "Loan chat");

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-3xl flex-col px-4 py-6 dt:px-10">
      <div className="flex items-center justify-between gap-4 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <Link
            aria-label="Back to chats"
            className="flex size-9 items-center justify-center rounded-lg border border-line text-ink/60 transition-colors hover:border-accent hover:text-accent"
            href="/chat"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="type-body-alt text-[16px] uppercase">{title}</h1>
            <p className="font-secondary mt-0.5 text-[9px] text-ink/50">
              {conversation.type === "community" ? "COMMUNITY CHANNEL" : "PRIVATE LOAN CHANNEL"}
            </p>
          </div>
        </div>

        {counterpart ? (
          <Link
            className="flex items-center gap-2 border border-accent/60 bg-accent/10 px-3 py-1.5 font-secondary text-[9px] uppercase text-accent"
            href={`/users/${counterpart.id}`}
          >
            <Star className="size-3" />
            {Math.round(counterpart.trust_score)}
          </Link>
        ) : (
          <StatusBadge tone="muted">Open to all</StatusBadge>
        )}
      </div>

      {/* pinned loan-status chip */}
      {loan && (
        <Link
          className="mt-3 flex w-fit items-center gap-3 border border-line bg-black px-3 py-2 transition-colors hover:border-accent"
          href={`/loans/${loan.id}`}
        >
          <span className="blink-label size-2 shrink-0 bg-accent" />
          <span className="font-secondary text-[9px] uppercase text-ink">
            LOAN STATUS:{" "}
            <span className="text-accent">{loanStatusLabel(loan.status).toUpperCase()}</span>
          </span>
          <StatusBadge className="ml-1" tone={loanTone(loan.status)}>
            DUE {loan.due_date}
          </StatusBadge>
          <span className="font-secondary text-[9px] text-ink/40">OPEN →</span>
        </Link>
      )}

      <MessageThread
        conversationId={conversation.id}
        currentUserId={profile.id}
        initialMessages={messages}
        isCommunity={conversation.type === "community"}
      />
    </div>
  );
}
