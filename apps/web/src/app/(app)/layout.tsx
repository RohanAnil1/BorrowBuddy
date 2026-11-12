import { redirect } from "next/navigation";
import { ActionToaster } from "@/components/app/action-toaster";
import { AppShell } from "@/components/app/app-shell";
import { AssistantLauncher } from "@/components/assistant/assistant-launcher";
import "@/components/assistant/assistant.css";
import { requireProfile } from "@/lib/auth/guards";
import { getUnreadCount } from "@/lib/data/notifications";
import { readFlash } from "@/lib/flash";
import { getPendingRequestCount } from "@/lib/data/requests";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const profile = await requireProfile();

  // Bootstrap admins sign up with no name and should never be sent through
  // onboarding; everyone else finishes onboarding before the portal opens.
  if (!profile.full_name && !profile.is_admin) {
    redirect("/onboarding");
  }

  // Strict gate: the portal and profile stay locked until a campus admin
  // approves the student ID. Admins are bootstrap-verified, so no exception
  // is needed here beyond the guard itself.
  if (profile.verification_status !== "verified") {
    redirect("/pending");
  }

  const [unreadCount, pendingCount, flash] = await Promise.all([
    getUnreadCount(profile.id),
    profile.verification_status === "verified" ? getPendingRequestCount(profile.id) : 0,
    readFlash(),
  ]);

  return (
    <>
      <AppShell pendingCount={pendingCount} profile={profile} unreadCount={unreadCount}>
        {children}
      </AppShell>
      <ActionToaster flash={flash} />
      <AssistantLauncher firstName={profile.full_name?.split(/\s+/)[0] ?? ""} userId={profile.id} />
    </>
  );
}
