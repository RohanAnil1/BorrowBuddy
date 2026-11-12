import { ChatDirectory } from "@/components/app/chat-directory";
import { requireVerified } from "@/lib/auth/guards";
import { getConversations } from "@/lib/data/chat";

export const metadata = { title: "Chat" };

export default async function ChatPage() {
  const profile = await requireVerified();
  const conversations = await getConversations(profile.id);
  return (
    <section className="chat-workspace chat-workspace-inbox">
      <ChatDirectory conversations={conversations} />
    </section>
  );
}
