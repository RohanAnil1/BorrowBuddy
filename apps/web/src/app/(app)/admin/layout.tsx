import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdmin } from "@/lib/auth/guards";
import { getAdminOverview, isStale } from "@/lib/data/admin";

/**
 * The admin console frame: navigation with live queue counts beside every
 * admin page. Pages still call requireAdmin() themselves (defence in depth).
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const me = await requireAdmin();
  const overview = await getAdminOverview();
  const { queues, oldest, students, activity } = overview;

  return (
    <div className="flex w-full flex-1 flex-col dt:flex-row">
      <AdminNav
        adminName={me.full_name || me.email}
        counts={{
          verifications: queues.verifications,
          reports: queues.reports,
          incidents: queues.incidents,
          fines: queues.fines,
          claims: queues.claims,
          students: students.total,
          groups: activity.groups,
          pins: activity.pickup_spots,
        }}
        stale={{
          verifications: isStale(oldest.verifications),
          reports: isStale(oldest.reports),
          incidents: isStale(oldest.incidents),
          fines: false,
          claims: isStale(oldest.claims),
        }}
      />
      <div className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 pt-6 pb-16 dt:px-10 dt:pt-8">{children}</div>
    </div>
  );
}
