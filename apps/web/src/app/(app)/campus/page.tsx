import Link from "next/link";
import { ArrowUpRight, CalendarClock, Gift, Search } from "lucide-react";
import { CampusFrame, secondaryClass } from "@/components/campus/campus-ui";
import { requireVerified } from "@/lib/auth/guards";

export const metadata = { title: "Campus Commons" };
export default async function CampusPage() {
  const profile = await requireVerified();
  return (
    <CampusFrame
      title="Good things come around."
      description="Find what was lost. Pass on what you no longer need. Make the handover happen."
    >
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {[
          {
            href: "/campus/lost-found",
            icon: Search,
            number: "01",
            title: "Back to its owner",
            label: "LOST & FOUND",
            body: "Found something? Give it a safe route home through private ownership checks and campus admin review.",
          },
          {
            href: "/campus/giveaways",
            icon: Gift,
            number: "02",
            title: "Next semester. New hands.",
            label: "GIVEAWAY SHELF",
            body: "Textbooks, stationery and hostel essentials. Free to a verified student who can put them to use.",
          },
          {
            href: "/campus/handovers",
            icon: CalendarClock,
            number: "03",
            title: "A time that works",
            label: "HANDOVER HOURS",
            body: "Publish your weekly hours, choose a collection time and spend less time coordinating.",
          },
        ].map((x) => (
          <Link
            key={x.href}
            href={x.href}
            className="group flex min-h-80 flex-col justify-between border border-line bg-black p-6 transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
          >
            <div className="flex items-start justify-between">
              <x.icon className="size-9 text-accent" />
              <span className="font-ticket text-5xl text-ink/15">
                {x.number}
              </span>
            </div>
            <div className="mt-10">
              <p className="font-secondary text-[10px] text-accent">
                [ {x.label} ]
              </p>
              <h2 className="type-title mt-3 text-3xl">{x.title}</h2>
              <p className="mt-3 text-sm normal-case leading-6 text-ink/60">
                {x.body}
              </p>
              <ArrowUpRight className="mt-6 size-5 text-accent" />
            </div>
          </Link>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-y border-ink/15 py-6">
        <p className="font-secondary text-[10px] text-ink/60">
          VERIFIED MEMBERS · PRIVATE COLLECTIONS · ONE-TIME CONFIRMATION
        </p>
        {profile.is_admin && (
          <Link className={secondaryClass} href="/campus/admin">
            REVIEW OWNERSHIP CLAIMS →
          </Link>
        )}
      </div>
    </CampusFrame>
  );
}
