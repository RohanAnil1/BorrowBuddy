import { Archive, ChevronRight, Globe, Lock, Megaphone, MessagesSquare, Pin, Plus } from "lucide-react";
import Link from "next/link";
import { Drawer } from "@/components/admin/drawer";
import { Cell, DataTable, FilterChips, PageHeader, Row } from "@/components/admin/ui";
import { EmptyState } from "@/components/app/empty-state";
import { GroupSettingsFields } from "@/components/app/group-settings-fields";
import { SubmitButton } from "@/components/app/submit-button";
import { requireAdmin } from "@/lib/auth/guards";
import { getAdminGroups } from "@/lib/data/chat";
import { relativeTime } from "@/lib/format";
import { createGroup } from "./actions";

export const metadata = { title: "Groups · Admin" };

const VIEWS = ["active", "archived", "all"] as const;
type View = (typeof VIEWS)[number];

export default async function AdminGroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; new?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const view: View = VIEWS.includes(params.view as View) ? (params.view as View) : "active";
  const groups = await getAdminGroups();
  const active = groups.filter((group) => !group.archived_at);
  const archived = groups.length - active.length;
  const shown = view === "all" ? groups : view === "archived" ? groups.filter((group) => group.archived_at) : active;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <Drawer
            defaultOpen={params.new === "1"}
            description="Public groups appear in every verified student's Messages. Private groups are visible only to the members you add. You join every group you create."
            eyebrow="NEW GROUP"
            icon={<Plus aria-hidden className="size-4" />}
            label="New group"
            title="Create a group"
            variant="primary"
          >
            <form action={createGroup} className="grid gap-5">
              <GroupSettingsFields />
              <div>
                <SubmitButton pendingLabel="Creating…">Create group</SubmitButton>
              </div>
            </form>
          </Drawer>
        }
        description="Campus-wide chats for clubs, hostels and courses. Open a group to edit it, manage members, unpin messages or delete it."
        eyebrow={`DIRECTORY · ${active.length} ACTIVE GROUPS`}
        title="Group chats"
      />

      <FilterChips
        items={VIEWS.map((key) => ({
          key,
          label: key,
          count: key === "active" ? active.length : key === "archived" ? archived : groups.length,
          href: key === "active" ? "/admin/groups" : `/admin/groups?view=${key}`,
          active: key === view,
        }))}
        label="Group status"
      />

      {shown.length === 0 ? (
        <EmptyState
          body={view === "archived" ? "Archived groups keep their history and stay read-only." : "Create the first group with the New group button."}
          code="NO GROUPS"
          icon={<MessagesSquare className="size-7" />}
          title={view === "archived" ? "Nothing archived" : "No groups yet"}
        />
      ) : (
        <DataTable
          caption="Group chats"
          columns={[
            { label: "Group" },
            { label: "Type" },
            { label: "Members", className: "text-right" },
            { label: "Messages", className: "text-right" },
            { label: "Last message" },
            { label: "", className: "w-1" },
          ]}
        >
          {shown.map((group) => {
            const href = `/admin/groups/${group.id}`;
            const Icon = group.visibility === "invite" ? Lock : Globe;
            return (
              <Row key={group.id}>
                <Cell label="">
                  <Link className="group flex min-w-0 items-start gap-3" href={href}>
                    <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-line text-accent">
                      <Icon aria-hidden className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] normal-case group-hover:text-accent">{group.title}</span>
                      {group.description && (
                        <span className="block max-w-md truncate text-[12px] normal-case text-ink/55">{group.description}</span>
                      )}
                    </span>
                  </Link>
                </Cell>
                <Cell label="Type">
                  <span className="flex flex-wrap gap-1.5">
                    <span className="font-secondary rounded-full border border-line px-2 py-0.5 text-[10px] text-ink/70">
                      {group.visibility === "invite" ? "Private" : "Public"}
                    </span>
                    {group.posting === "admins" && (
                      <span className="font-secondary inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[10px] text-ink/70">
                        <Megaphone aria-hidden className="size-3" /> Announcements
                      </span>
                    )}
                    {group.archived_at && (
                      <span className="font-secondary inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[10px] text-ink/55">
                        <Archive aria-hidden className="size-3" /> Archived
                      </span>
                    )}
                  </span>
                </Cell>
                <Cell className="dt:text-right" label="Members">
                  <span className="text-[14px] tabular-nums">{group.member_count}</span>
                </Cell>
                <Cell className="dt:text-right" label="Messages">
                  <span className="text-[14px] tabular-nums">
                    {group.message_count}
                    {group.pinned_count > 0 && (
                      <span className="ml-2 inline-flex items-center gap-0.5 text-[12px] text-ink/55">
                        <Pin aria-hidden className="size-3" />
                        {group.pinned_count}
                      </span>
                    )}
                  </span>
                </Cell>
                <Cell label="Last message">
                  <span className="text-[13px] normal-case text-ink/60 dt:whitespace-nowrap">
                    {group.last_message_at ? relativeTime(group.last_message_at) : "No messages"}
                  </span>
                </Cell>
                <Cell hideOnMobile label="">
                  <Link aria-label={`Manage ${group.title}`} className="grid size-9 place-items-center rounded-lg text-ink/50 hover:bg-ink/5 hover:text-accent" href={href}>
                    <ChevronRight aria-hidden className="size-4" />
                  </Link>
                </Cell>
              </Row>
            );
          })}
        </DataTable>
      )}
    </div>
  );
}
