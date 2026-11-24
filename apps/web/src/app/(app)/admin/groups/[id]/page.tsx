import { ArrowUpRight, Pin, Search, Settings2, UserMinus, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, DangerZone, KeyValue, PageHeader, Panel, buttonClass, inputClass } from "@/components/admin/ui";
import { ConfirmSubmit } from "@/components/app/confirm-submit";
import { GroupSettingsFields } from "@/components/app/group-settings-fields";
import { StatusBadge } from "@/components/app/status-badge";
import { SubmitButton } from "@/components/app/submit-button";
import { UUID } from "@/lib/admin-actions";
import { requireAdmin } from "@/lib/auth/guards";
import { getAdminGroups, getGroupMembers, getPinnedMessages } from "@/lib/data/chat";
import { relativeTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { addGroupMember, deleteGroup, removeGroupMember, unpinGroupMessage, updateGroup } from "../actions";

export const metadata = { title: "Group · Admin" };

type Candidate = { id: string; full_name: string; department: string | null; year_of_study: number | null };

async function findStudents(query: string, exclude: Set<string>): Promise<Candidate[]> {
  const term = query.trim().replace(/[%_,()\\]/g, " ").trim();
  if (term.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, ...departments(department:name), year_of_study")
    .eq("verification_status", "verified")
    .ilike("full_name", `%${term}%`)
    .order("full_name")
    .limit(12);
  return ((data as Candidate[] | null) ?? []).filter((row) => !exclude.has(row.id));
}

export default async function AdminGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();
  const [{ id }, { q = "" }] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const group = (await getAdminGroups()).find((row) => row.id === id);
  if (!group) notFound();

  const [members, pinned] = await Promise.all([getGroupMembers(id), getPinnedMessages(id)]);
  const candidates = await findStudents(q, new Set(members.map((member) => member.user_id)));
  const kind = group.visibility === "invite" ? "Private" : "Public";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <Link className={buttonClass.secondary} href={`/chat/${group.id}`}>
            Open chat <ArrowUpRight aria-hidden className="size-4" />
          </Link>
        }
        back={{ href: "/admin/groups", label: "All groups" }}
        description={group.description ?? undefined}
        eyebrow={`${kind} GROUP${group.posting === "admins" ? " · ANNOUNCEMENTS" : ""}${group.archived_at ? " · ARCHIVED" : ""}`}
        title={<span className="normal-case">{group.title}</span>}
      />

      <div className="border border-line bg-panel p-5">
        <KeyValue
          items={[
            { label: "Members", value: group.member_count },
            { label: "Messages", value: group.message_count },
            { label: "Pinned", value: group.pinned_count },
            { label: "Last message", value: group.last_message_at ? relativeTime(group.last_message_at) : "—" },
          ]}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel icon={<Settings2 aria-hidden className="size-3.5" />} title="Settings">
          <form action={updateGroup} className="grid gap-5">
            <input name="group_id" type="hidden" value={group.id} />
            <GroupSettingsFields group={group} />
            <div>
              <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
            </div>
          </form>
        </Panel>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel bodyClassName="p-0" count={members.length} icon={<Users aria-hidden className="size-3.5" />} title="Members">
            <div className="border-b border-line p-4">
              <form className="flex gap-2" role="search">
                <label className="relative flex min-w-0 flex-1 items-center">
                  <span className="sr-only">Find a verified student to add</span>
                  <Search aria-hidden className="pointer-events-none absolute left-3 size-4 text-ink/45" />
                  <input className={`${inputClass} pl-9`} defaultValue={q} name="q" placeholder="Add a verified student by name" />
                </label>
                <SubmitButton variant="secondary">Find</SubmitButton>
              </form>
              {q.trim().length >= 2 && (
                <ul className="mt-3 flex flex-col divide-y divide-line border border-line">
                  {candidates.length === 0 && (
                    <li className="p-3 text-[13px] normal-case text-ink/60">
                      No verified students match “{q.trim()}” who aren&apos;t already members.
                    </li>
                  )}
                  {candidates.map((student) => (
                    <li className="flex items-center justify-between gap-3 p-3" key={student.id}>
                      <span className="flex min-w-0 items-center gap-3">
                        <Avatar name={student.full_name} size={32} />
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] normal-case">{student.full_name}</span>
                          <span className="block truncate text-[12px] normal-case text-ink/55">
                            {[student.department, student.year_of_study ? `Year ${student.year_of_study}` : null].filter(Boolean).join(" · ") || "—"}
                          </span>
                        </span>
                      </span>
                      <form action={addGroupMember}>
                        <input name="group_id" type="hidden" value={group.id} />
                        <input name="user_id" type="hidden" value={student.id} />
                        <SubmitButton className="min-h-9 px-3 text-[12px]" pendingLabel="…" variant="secondary">
                          <UserPlus aria-hidden className="size-3.5" /> Add
                        </SubmitButton>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-[12px] normal-case leading-5 text-ink/55">
                Added students get a notification. In a public group, a removed student can join again — make it private to keep someone out.
              </p>
            </div>

            {members.length === 0 ? (
              <p className="px-5 py-6 text-[13px] normal-case text-ink/60">Nobody is in this group yet.</p>
            ) : (
              <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto">
                {members.map((member) => {
                  const name = member.full_name || "Campus member";
                  return (
                    <li className="flex items-center justify-between gap-3 px-4 py-2.5" key={member.user_id}>
                      <Link className="flex min-w-0 items-center gap-3 hover:text-accent" href={`/admin/students/${member.user_id}`}>
                        <Avatar name={name} size={32} />
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] normal-case">{name}</span>
                          <span className="block text-[12px] normal-case text-ink/55">
                            {member.is_admin ? "Admin · " : ""}joined {relativeTime(member.joined_at)}
                          </span>
                        </span>
                      </Link>
                      <form action={removeGroupMember}>
                        <input name="group_id" type="hidden" value={group.id} />
                        <input name="user_id" type="hidden" value={member.user_id} />
                        <ConfirmSubmit
                          className="min-h-9 px-3 text-[12px]"
                          confirmLabel="Remove"
                          message={`${name} leaves “${group.title}” and stops seeing new messages.`}
                          pendingLabel="…"
                          title={`Remove ${name}?`}
                        >
                          <UserMinus aria-hidden className="size-3.5" />
                          <span className="sr-only">Remove {name}</span>
                        </ConfirmSubmit>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel bodyClassName="p-0" count={pinned.length} icon={<Pin aria-hidden className="size-3.5" />} title="Pinned messages">
            {pinned.length === 0 ? (
              <p className="px-5 py-6 text-[13px] normal-case text-ink/60">Nothing is pinned. Pin a message from its menu in the chat.</p>
            ) : (
              <ul className="divide-y divide-line">
                {pinned.map((message) => (
                  <li className="flex items-center justify-between gap-3 px-4 py-3" key={message.id}>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] normal-case">
                        {message.poll ? `Poll: ${message.poll.question}` : message.body || "Photo"}
                      </span>
                      <span className="block text-[12px] normal-case text-ink/55">
                        {message.sender?.full_name ?? "Campus member"}
                        {message.pinned_at ? ` · pinned ${relativeTime(message.pinned_at)}` : ""}
                      </span>
                    </span>
                    <form action={unpinGroupMessage}>
                      <input name="group_id" type="hidden" value={group.id} />
                      <input name="message_id" type="hidden" value={message.id} />
                      <SubmitButton className="min-h-9 px-3 text-[12px]" pendingLabel="…" variant="secondary">
                        Unpin
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <DangerZone title="Delete group">
        <div className="flex flex-col gap-4 dt:flex-row dt:items-center dt:justify-between">
          <p className="text-[14px] normal-case leading-6 text-ink/75">
            Deletes the group and every message in it for everyone. To keep the history, tick <StatusBadge>Archived</StatusBadge> in the
            settings instead.
          </p>
          <form action={deleteGroup}>
            <input name="group_id" type="hidden" value={group.id} />
            <ConfirmSubmit
              confirmLabel="Delete group"
              message={`“${group.title}” and its ${group.message_count} messages will be deleted for all ${group.member_count} members. This can't be undone.`}
              title="Delete this group?"
            >
              Delete group
            </ConfirmSubmit>
          </form>
        </div>
      </DangerZone>
    </div>
  );
}
