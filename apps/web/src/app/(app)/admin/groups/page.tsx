import { Archive, ArrowLeft, Hash, Lock, MessagesSquare, Plus, Users } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { GroupSettingsFields } from "@/components/app/group-settings-fields";
import { SubmitButton } from "@/components/app/submit-button";
import { requireAdmin } from "@/lib/auth/guards";
import { getAdminGroups } from "@/lib/data/chat";
import { relativeTime } from "@/lib/format";
import { createGroup } from "./actions";

export const metadata = { title: "Groups · Admin" };

export default async function AdminGroupsPage() {
  await requireAdmin();
  const groups = await getAdminGroups();
  const active = groups.filter((group) => !group.archived_at).length;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 dt:px-10">
      <Link className="font-secondary inline-flex items-center gap-2 text-[10px] text-ink/60 hover:text-accent" href="/admin">
        <ArrowLeft className="size-3.5" /> MODERATION DESK
      </Link>
      <p className="status-bracket mt-6 text-[10px]">[ CONTROL ROOM — ADMIN ONLY ]</p>
      <h1 className="type-title mt-3 text-[2rem] dt:text-[2.5rem]">Group chats</h1>
      <p className="type-body mt-2 max-w-[60ch] text-[13px] normal-case text-ink/70">
        Campus-wide groups for clubs, hostels and courses. Open groups appear in every verified student’s
        Messages; invite-only groups are visible only to the members you add.
      </p>

      <section className="mt-10" aria-labelledby="groups-heading">
        <h2 id="groups-heading" className="font-secondary text-[11px] uppercase text-ink/60">
          [ GROUPS ] <span className="ml-2 text-ink/40">{active} ACTIVE · {groups.length - active} ARCHIVED</span>
        </h2>
        <div className="mt-4 flex flex-col gap-3">
          {groups.length === 0 ? (
            <EmptyState compact code="NO GROUPS" title="No groups yet" body="Create the first one below." />
          ) : (
            groups.map((group) => (
              <Link
                className="flex flex-wrap items-center justify-between gap-4 border border-line bg-panel p-5 transition-colors hover:border-accent"
                href={`/admin/groups/${group.id}`}
                key={group.id}
              >
                <div className="min-w-0 flex-1">
                  <p className="type-body-alt flex items-center gap-2 text-[14px] normal-case">
                    {group.visibility === "invite" ? <Lock className="size-3.5 text-ink/60" aria-label="Invite-only" /> : <Hash className="size-3.5 text-accent" aria-label="Open" />}
                    <span className="truncate">{group.title}</span>
                    {group.archived_at && (
                      <span className="font-secondary inline-flex items-center gap-1 border border-line px-1.5 py-0.5 text-[8px] text-ink/60">
                        <Archive className="size-2.5" /> ARCHIVED
                      </span>
                    )}
                  </p>
                  {group.description && <p className="type-body mt-1 line-clamp-2 text-[12px] normal-case text-ink/60">{group.description}</p>}
                </div>
                <dl className="font-secondary flex gap-5 text-[10px] text-ink/60">
                  <div className="flex items-center gap-1.5"><Users className="size-3.5" /><dt className="sr-only">Members</dt><dd>{group.member_count}</dd></div>
                  <div className="flex items-center gap-1.5"><MessagesSquare className="size-3.5" /><dt className="sr-only">Messages</dt><dd>{group.message_count}</dd></div>
                  <div><dt className="sr-only">Last message</dt><dd>{group.last_message_at ? relativeTime(group.last_message_at) : "No messages"}</dd></div>
                </dl>
              </Link>
            ))
          )}
        </div>
      </section>

      <section className="mt-12 border border-line bg-panel p-5" aria-labelledby="create-group-heading">
        <h2 id="create-group-heading" className="flex items-center gap-2 font-secondary text-[10px] text-ink/60">
          <Plus className="size-3.5 text-accent" /> [ CREATE A GROUP ]
        </h2>
        <form action={createGroup} className="mt-4 grid gap-5">
          <GroupSettingsFields />
          <div><SubmitButton pendingLabel="Creating…">Create group</SubmitButton></div>
        </form>
        <p className="font-secondary mt-4 text-[9px] text-ink/40">YOU JOIN EVERY GROUP YOU CREATE. ADD MEMBERS ON THE GROUP’S PAGE.</p>
      </section>
    </div>
  );
}
