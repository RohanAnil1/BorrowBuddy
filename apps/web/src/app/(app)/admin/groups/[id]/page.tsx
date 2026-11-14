import { ArrowLeft, ArrowUpRight, Pin, Search, UserPlus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmSubmit } from "@/components/app/confirm-submit";
import { GroupSettingsFields } from "@/components/app/group-settings-fields";
import { SubmitButton } from "@/components/app/submit-button";
import { requireAdmin } from "@/lib/auth/guards";
import { getAdminGroups, getGroupMembers, getPinnedMessages } from "@/lib/data/chat";
import { initials, relativeTime } from "@/lib/format";
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
    .select("id, full_name, department, year_of_study")
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
  const group = (await getAdminGroups()).find((row) => row.id === id);
  if (!group) notFound();

  const [members, pinned] = await Promise.all([getGroupMembers(id), getPinnedMessages(id)]);
  const candidates = await findStudents(q, new Set(members.map((member) => member.user_id)));

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 dt:px-10">
      <Link className="font-secondary inline-flex items-center gap-2 text-[10px] text-ink/60 hover:text-accent" href="/admin/groups">
        <ArrowLeft className="size-3.5" /> ALL GROUPS
      </Link>
      <p className="status-bracket mt-6 text-[10px]">[ {group.visibility === "invite" ? "PRIVATE" : "PUBLIC"} GROUP{group.posting === "admins" ? " · ANNOUNCEMENTS" : ""}{group.archived_at ? " · ARCHIVED" : ""} ]</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <h1 className="type-title text-[2rem] normal-case dt:text-[2.5rem]">{group.title}</h1>
        <Link className="font-secondary inline-flex items-center gap-1.5 text-[10px] text-accent hover:underline" href={`/chat/${group.id}`}>
          OPEN CHAT <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
      <p className="font-secondary mt-2 text-[10px] text-ink/50">
        {group.member_count} MEMBERS · {group.message_count} MESSAGES · {group.last_message_at ? `LAST ${relativeTime(group.last_message_at).toUpperCase()}` : "NO MESSAGES YET"}
      </p>

      <section className="mt-10 border border-line bg-panel p-5" aria-labelledby="settings-heading">
        <h2 id="settings-heading" className="font-secondary text-[10px] text-ink/60">[ SETTINGS ]</h2>
        <form action={updateGroup} className="mt-4 grid gap-5">
          <input name="group_id" type="hidden" value={group.id} />
          <GroupSettingsFields group={group} />
          <div><SubmitButton pendingLabel="Saving…">Save changes</SubmitButton></div>
        </form>
      </section>

      <section className="mt-10" aria-labelledby="pins-heading">
        <h2 id="pins-heading" className="font-secondary text-[11px] uppercase text-ink/60">[ PINNED MESSAGES ] <span className="ml-2 text-ink/40">{pinned.length}</span></h2>
        <ul className="mt-4 divide-y divide-line border border-line bg-panel">
          {pinned.length === 0 && <li className="p-5 text-[13px] normal-case text-ink/60">Nothing is pinned. Pin a message from its menu in the chat.</li>}
          {pinned.map((message) => (
            <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3" key={message.id}>
              <span className="flex min-w-0 flex-1 items-start gap-2 text-[13px] normal-case">
                <Pin className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate">{message.poll ? `Poll: ${message.poll.question}` : message.body || "Photo"}</span>
                  <span className="font-secondary block text-[9px] text-ink/50">{message.sender?.full_name ?? "Campus member"}{message.pinned_at ? ` · PINNED ${relativeTime(message.pinned_at).toUpperCase()}` : ""}</span>
                </span>
              </span>
              <form action={unpinGroupMessage}>
                <input name="group_id" type="hidden" value={group.id} />
                <input name="message_id" type="hidden" value={message.id} />
                <SubmitButton pendingLabel="…" variant="secondary">Unpin</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10" aria-labelledby="members-heading">
        <h2 id="members-heading" className="font-secondary text-[11px] uppercase text-ink/60">[ MEMBERS ] <span className="ml-2 text-ink/40">{members.length}</span></h2>
        <ul className="mt-4 divide-y divide-line border border-line bg-panel">
          {members.length === 0 && <li className="p-5 text-[13px] normal-case text-ink/60">Nobody is in this group yet.</li>}
          {members.map((member) => (
            <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3" key={member.user_id}>
              <Link className="flex min-w-0 items-center gap-3 hover:text-accent" href={`/users/${member.user_id}`}>
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-line font-strong text-[11px]">{initials(member.full_name || "?")}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] normal-case">{member.full_name || "Campus member"}</span>
                  <span className="font-secondary block text-[9px] text-ink/50">{member.is_admin ? "ADMIN · " : ""}JOINED {relativeTime(member.joined_at).toUpperCase()}</span>
                </span>
              </Link>
              <form action={removeGroupMember}>
                <input name="group_id" type="hidden" value={group.id} />
                <input name="user_id" type="hidden" value={member.user_id} />
                <SubmitButton pendingLabel="…" variant="danger">Remove</SubmitButton>
              </form>
            </li>
          ))}
        </ul>

        <div className="mt-4 border border-line bg-panel p-5">
          <h3 className="flex items-center gap-2 font-secondary text-[10px] text-ink/60"><UserPlus className="size-3.5 text-accent" /> [ ADD A VERIFIED STUDENT ]</h3>
          <form className="mt-3 flex gap-2" role="search">
            <label className="flex flex-1 items-center gap-2 rounded-lg border border-line bg-black px-3 focus-within:border-accent">
              <Search className="size-4 text-ink/50" aria-hidden="true" />
              <input aria-label="Search students by name" className="min-h-10 flex-1 bg-transparent text-[13px] normal-case outline-none" defaultValue={q} name="q" placeholder="Search by name" />
            </label>
            <SubmitButton variant="secondary">Search</SubmitButton>
          </form>
          {q.trim().length >= 2 && (
            <ul className="mt-3 flex flex-col gap-2">
              {candidates.length === 0 && <li className="text-[12px] normal-case text-ink/60">No verified students match “{q.trim()}” who aren’t already members.</li>}
              {candidates.map((student) => (
                <li className="flex flex-wrap items-center justify-between gap-3" key={student.id}>
                  <span className="text-[13px] normal-case">
                    {student.full_name}
                    <span className="ml-2 text-[11px] text-ink/50">{[student.department, student.year_of_study ? `Year ${student.year_of_study}` : null].filter(Boolean).join(" · ")}</span>
                  </span>
                  <form action={addGroupMember}>
                    <input name="group_id" type="hidden" value={group.id} />
                    <input name="user_id" type="hidden" value={student.id} />
                    <SubmitButton pendingLabel="…" variant="secondary">Add</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <p className="font-secondary mt-3 text-[9px] text-ink/40">ADDED STUDENTS GET A NOTIFICATION. IN A PUBLIC GROUP, A REMOVED STUDENT CAN JOIN AGAIN — MAKE IT PRIVATE TO KEEP SOMEONE OUT.</p>
        </div>
      </section>

      <section className="mt-12 border border-warn/40 p-5" aria-labelledby="danger-heading">
        <h2 id="danger-heading" className="font-secondary text-[10px] text-warn">[ DELETE GROUP ]</h2>
        <p className="type-body mt-2 text-[13px] normal-case text-ink/70">Deletes the group and every message in it for everyone. To keep the history, archive it instead.</p>
        <form action={deleteGroup} className="mt-4">
          <input name="group_id" type="hidden" value={group.id} />
          <ConfirmSubmit confirmLabel="Delete group" message={`“${group.title}” and its ${group.message_count} messages will be deleted for all ${group.member_count} members. This can’t be undone.`} title="Delete this group?">
            Delete group
          </ConfirmSubmit>
        </form>
      </section>
    </div>
  );
}
