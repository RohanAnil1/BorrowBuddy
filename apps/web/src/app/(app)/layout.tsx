import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { requireProfile } from "@/lib/auth/guards";
import { getUnreadCount } from "@/lib/data/notifications";
import { getPendingRequestCount } from "@/lib/data/requests";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const profile = await requireProfile();

  if (!profile.full_name) {
    redirect("/onboarding");
  }

  // Strict gate: the portal and profile stay locked until a campus admin
  // approves the student ID. Admins are bootstrap-verified, so no exception
  // is needed here beyond the guard itself.
  if (profile.verification_status !== "verified") {
    redirect("/pending");
  }

  const [unreadCount, pendingCount] = await Promise.all([
    getUnreadCount(profile.id),
    profile.verification_status === "verified" ? getPendingRequestCount(profile.id) : 0,
  ]);

  return (
    <AppShell pendingCount={pendingCount} profile={profile} unreadCount={unreadCount}>
      {children}
    </AppShell>
  );
}
