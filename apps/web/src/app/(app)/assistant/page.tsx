import { AssistantPage } from "@/components/assistant/assistant-page";
import { requireVerified } from "@/lib/auth/guards";

export const metadata = { title: "Buddy" };

export default async function BuddyPage({ searchParams }: { searchParams: Promise<{ mascot?: string }> }) {
  const profile = await requireVerified();
  const { mascot } = await searchParams;
  const firstName = profile.full_name?.split(/\s+/)[0] ?? "";

  return <AssistantPage firstName={firstName} showSheet={mascot === "sheet"} />;
}
