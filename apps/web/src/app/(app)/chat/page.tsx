import { MessagesSquare } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { relativeTime } from "@/lib/format";
import { requireVerified } from "@/lib/auth/guards";
import { getConversations } from "@/lib/data/chat";
import { cn } from "@/lib/utils";

export const metadata = { title: "Chat" };

export default async function ChatPage() {
  const profile = await requireVerified();
  const conversations = await getConversations(profile.id);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 dt:px-10">
      <p className="status-bracket text-[10px]">[ RADIO ROOM ]</p>
      <h1 className="type-title mt-3 text-[2rem] dt:text-[2.5rem]">Chat</h1>
      <p className="type-body mt-2 text-[13px] text-ink/60 uppercase">
        Loan channels are private to the two students. Community channels are open to
        every verified student.
      </p>

      <div className="mt-8">
        {conversations.length === 0 ? (
          <EmptyState
            body="EVERY APPROVED REQUEST OPENS A PRIVATE CHANNEL SO YOU CAN AGREE ON A PICKUP SPOT AND TIME."
            icon={<MessagesSquare className="size-7" />}
            title="No conversations yet"
          />
        ) : (
          <ol className="flex flex-col gap-3">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <Link
                  className={cn(
                    "flex items-center justify-between gap-4 border p-5 transition-colors",
                    conversation.unread
                      ? "border-accent/60 bg-accent/5"
                      : "border-line bg-panel hover:border-accent/50",
                  )}
                  href={`/chat/${conversation.id}`}
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-secondary text-[12px] uppercase text-ink">
                      <span className="truncate">{conversation.title}</span>
                      {conversation.unread && <span className="size-2 shrink-0 bg-accent" />}
                    </p>
                    <p className="font-secondary mt-0.5 text-[9px] text-ink/50">
                      {conversation.subtitle?.toUpperCase()}
                    </p>
                    {conversation.lastMessage && (
                      <p className="type-body mt-2 truncate text-[13px] text-ink/60">
                        {conversation.lastMessage}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 font-secondary text-[9px] uppercase text-ink/40">
                    {conversation.lastMessageAt ? relativeTime(conversation.lastMessageAt) : "NEW"}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
