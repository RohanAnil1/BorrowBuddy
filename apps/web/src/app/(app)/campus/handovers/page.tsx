import Link from "next/link";
import { campusDate } from "@borrowbuddy/shared";
import {
  CampusBadge,
  CampusEmpty,
  CampusFrame,
  secondaryClass,
} from "@/components/campus/campus-ui";
import { ActionForm } from "@/components/campus/campus-forms";
import { ScheduleEditor } from "@/components/campus/campus-scheduling";
import { requireVerified } from "@/lib/auth/guards";
import {
  campusAppointments,
  campusPeople,
  campusSchedule,
} from "@/lib/data/campus";
import { getPickupLocations } from "@/lib/data/items";

export default async function HandoversPage() {
  const profile = await requireVerified();
  const [appointments, schedule, locations] = await Promise.all([
    campusAppointments(),
    campusSchedule(profile.id),
    getPickupLocations(),
  ]);
  const people = await campusPeople(
    appointments.flatMap((a) => [a.host_id, a.recipient_id]),
  );
  const spots = Object.fromEntries(locations.map((l) => [l.id, l.name]));
  const sorted = [...appointments].sort(
    (a, b) =>
      (a.status === "booked" ? 0 : 1) - (b.status === "booked" ? 0 : 1) ||
      a.starts_at.localeCompare(b.starts_at),
  );
  return (
    <CampusFrame
      title="Less back-and-forth. More right on time."
      description="Your appointments and reusable pickup hours. All times are shown in India Standard Time."
    >
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <section>
          <h2 className="type-title mb-5 text-2xl">Your handovers</h2>
          {!sorted.length ? (
            <CampusEmpty
              title="No appointments yet"
              body="Book a time from an active loan or collection. Your existing handover code works without an appointment too."
            />
          ) : (
            <div className="space-y-4">
              {sorted.map((a) => (
                <article
                  key={a.id}
                  className="space-y-4 border border-line bg-black p-5"
                >
                  <CampusBadge>
                    {a.kind} · {a.status}
                  </CampusBadge>
                  <h3 className="type-title text-xl">
                    {campusDate(a.starts_at)} IST
                  </h3>
                  <p className="text-xs text-ink/60">
                    {spots[a.pickup_location_id] ?? "Campus pickup spot"} ·{" "}
                    {people[
                      a.host_id === profile.id ? a.recipient_id : a.host_id
                    ]?.full_name ?? "Campus member"}
                  </p>
                  <Link
                    className={secondaryClass}
                    href={
                      a.loan_id
                        ? `/loans/${a.loan_id}`
                        : `/campus/collections/${a.transfer_id}`
                    }
                  >
                    OPEN HANDOVER DETAILS →
                  </Link>
                  {a.status === "booked" && (
                    <ActionForm
                      action="cancel_appointment"
                      payload={{ id: a.id }}
                      label="CANCEL APPOINTMENT"
                      secondary
                      confirm="This releases the time slot; it does not cancel your loan or collection."
                    />
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
        <section className="space-y-5">
          <h2 className="type-title text-2xl">Your weekly hours</h2>
          <p className="text-sm normal-case leading-6 text-ink/60">
            Publish one window for each day you are available. Students choose a
            single appointment; both calendars are protected from overlapping
            handovers.
          </p>
          <ScheduleEditor schedule={schedule} locations={locations} />
        </section>
      </div>
    </CampusFrame>
  );
}
