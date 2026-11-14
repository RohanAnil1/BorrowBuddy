import { Globe, Lock, Megaphone, MessagesSquare } from "lucide-react";
import { GROUP_DESCRIPTION_MAX, GROUP_TITLE_MAX, type GroupPosting, type GroupVisibility } from "@borrowbuddy/shared";

const inputClass =
  "rounded-lg border border-line bg-black px-3 py-2 text-[13px] normal-case text-ink outline-none transition-colors focus:border-accent";
const labelClass = "flex flex-col gap-1.5 font-secondary text-[9px] text-ink/60";
const choiceClass =
  "flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-black p-3 text-[13px] normal-case transition-colors hover:border-accent/60 has-[:checked]:border-accent has-[:checked]:bg-accent/10";

function Choice({ name, value, checked, icon, title, body }: {
  name: string; value: string; checked: boolean; icon: React.ReactNode; title: string; body: string;
}) {
  return (
    <label className={choiceClass}>
      <input className="mt-1 accent-accent" defaultChecked={checked} name={name} type="radio" value={value} />
      <span className="mt-0.5 text-accent" aria-hidden="true">{icon}</span>
      <span className="flex flex-col gap-0.5">
        <strong className="font-strong">{title}</strong>
        <span className="text-ink/70">{body}</span>
      </span>
    </label>
  );
}

/** Name, description, Public/Private, who can post and (when editing) archive. */
export function GroupSettingsFields({ group }: {
  group?: { title: string; description: string | null; visibility: GroupVisibility; posting?: GroupPosting; archived_at: string | null };
}) {
  return (
    <div className="grid gap-5">
      <label className={labelClass}>
        NAME
        <input className={inputClass} defaultValue={group?.title} maxLength={GROUP_TITLE_MAX} name="title" placeholder="Photography club" required />
      </label>
      <label className={labelClass}>
        DESCRIPTION (OPTIONAL)
        <textarea className={`${inputClass} min-h-20`} defaultValue={group?.description ?? ""} maxLength={GROUP_DESCRIPTION_MAX} name="description" placeholder="What the group is for" />
      </label>
      <fieldset className="grid gap-2 dt:grid-cols-2">
        <legend className="mb-2 font-secondary text-[9px] text-ink/60">PUBLIC OR PRIVATE</legend>
        <Choice name="visibility" value="open" checked={group?.visibility !== "invite"} icon={<Globe className="size-4" />}
          title="Public" body="Any verified student can find it, read it and join." />
        <Choice name="visibility" value="invite" checked={group?.visibility === "invite"} icon={<Lock className="size-4" />}
          title="Private" body="Hidden. Only members you add can see, read and post." />
      </fieldset>
      <fieldset className="grid gap-2 dt:grid-cols-2">
        <legend className="mb-2 font-secondary text-[9px] text-ink/60">WHO CAN POST</legend>
        <Choice name="posting" value="everyone" checked={group?.posting !== "admins"} icon={<MessagesSquare className="size-4" />}
          title="Every member" body="A normal group chat." />
        <Choice name="posting" value="admins" checked={group?.posting === "admins"} icon={<Megaphone className="size-4" />}
          title="Only admins (announcements)" body="Members read, react and vote in polls." />
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
