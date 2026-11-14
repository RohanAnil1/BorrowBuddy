import { GROUP_DESCRIPTION_MAX, GROUP_TITLE_MAX, type GroupVisibility } from "@borrowbuddy/shared";

const inputClass =
  "rounded-lg border border-line bg-black px-3 py-2 text-[13px] normal-case text-ink outline-none transition-colors focus:border-accent";
const labelClass = "flex flex-col gap-1.5 font-secondary text-[9px] text-ink/60";

/** Name, description, open/invite-only and (when editing) archive, shared by create and edit. */
export function GroupSettingsFields({ group }: {
  group?: { title: string; description: string | null; visibility: GroupVisibility; archived_at: string | null };
}) {
  return (
    <div className="grid gap-4">
      <label className={labelClass}>
        NAME
        <input className={inputClass} defaultValue={group?.title} maxLength={GROUP_TITLE_MAX} name="title" placeholder="Photography club" required />
      </label>
      <label className={labelClass}>
        DESCRIPTION (OPTIONAL)
        <textarea className={`${inputClass} min-h-20`} defaultValue={group?.description ?? ""} maxLength={GROUP_DESCRIPTION_MAX} name="description" placeholder="What the group is for" />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="font-secondary text-[9px] text-ink/60">WHO CAN JOIN</legend>
        <label className="flex items-start gap-2 text-[13px] normal-case">
          <input className="mt-1 accent-accent" defaultChecked={group?.visibility !== "invite"} name="visibility" type="radio" value="open" />
          <span><strong className="font-strong">Open</strong> — any verified student can find, read, join and leave it.</span>
        </label>
        <label className="flex items-start gap-2 text-[13px] normal-case">
          <input className="mt-1 accent-accent" defaultChecked={group?.visibility === "invite"} name="visibility" type="radio" value="invite" />
          <span><strong className="font-strong">Invite-only</strong> — hidden; only members you add can read and post.</span>
        </label>
      </fieldset>
      {group && (
        <label className="flex items-start gap-2 text-[13px] normal-case">
          <input className="mt-1 accent-accent" defaultChecked={Boolean(group.archived_at)} name="archived" type="checkbox" />
          <span><strong className="font-strong">Archived</strong> — members keep the history read-only; nobody can post or join.</span>
        </label>
      )}
    </div>
  );
}
