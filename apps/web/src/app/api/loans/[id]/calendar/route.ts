import { getCurrentProfile } from "@/lib/data/profiles";
import { buildCalendar, type CalendarEvent } from "@/lib/calendar/ics";
import { campusAppointments } from "@/lib/data/campus";
import { getPickupLocations } from "@/lib/data/items";
import { getLoan } from "@/lib/data/loans";

const UUID = /^[0-9a-f-]{36}$/i;
const OPEN = ["awaiting_pickup", "active", "return_pending", "overdue"];
/** All-day events start at midnight; 15 hours before is 9 AM the day before. */
const DAY_BEFORE_9AM = 15 * 60;

/**
 * GET /api/loans/{id}/calendar: an .ics file with the loan's pickup and
 * return. Uses the booked handover slot when there is one, otherwise an
 * all-day event. Only the two people on the loan can download it.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });

  const profile = await getCurrentProfile();
  if (!profile) return new Response("Sign in first.", { status: 401 });

  const loan = await getLoan(id);
  // Admins can read every loan through RLS; the calendar is only for the two people on it.
  if (!loan || (loan.owner_id !== profile.id && loan.borrower_id !== profile.id)) {
    return new Response("Not found", { status: 404 });
  }
  if (!OPEN.includes(loan.status)) return new Response("This loan has no upcoming dates.", { status: 410 });

  const [appointments, locations] = await Promise.all([
    campusAppointments({ loan: id }).catch(() => []),
    getPickupLocations().catch(() => []),
  ]);
  const spotName = (spotId: string) => locations.find((spot) => spot.id === spotId)?.name;
  const booked = (kind: "pickup" | "return") =>
    appointments.find((appointment) => appointment.kind === kind && appointment.status === "booked");

  const isOwner = loan.owner_id === profile.id;
  const other = isOwner ? loan.borrower.full_name : loan.owner.full_name;
  const url = `${new URL(request.url).origin}/loans/${loan.id}`;
  const defaultSpot = loan.item.pickup_location?.name;
  const events: CalendarEvent[] = [];

  function addEvent(kind: "pickup" | "return", date: string, title: string, description: string) {
    const slot = booked(kind);
    events.push({
      uid: `${loan!.id}-${kind}@borrowbuddy`,
      title,
      description: `${description}\n${url}`,
      location: (slot && spotName(slot.pickup_location_id)) ?? defaultSpot ?? undefined,
      url,
      ...(slot
        ? { start: new Date(slot.starts_at), end: new Date(slot.ends_at), alarmMinutesBefore: 60 }
        : { date, alarmMinutesBefore: DAY_BEFORE_9AM }),
    });
  }

  if (loan.status === "awaiting_pickup") {
    addEvent(
      "pickup",
      loan.start_date,
      isOwner ? `Hand over ${loan.item.title}` : `Pick up ${loan.item.title}`,
      isOwner ? `${other} is collecting it. Confirm with the 6-digit code.` : `Collect it from ${other}. Show your 6-digit code.`,
    );
  }
  addEvent(
    "return",
    loan.due_date,
    isOwner ? `${loan.item.title} comes back` : `Return ${loan.item.title}`,
    isOwner ? `${other} returns it today.` : `Due back to ${other} today. Late returns can lead to fines.`,
  );

  const slug = loan.item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "loan";
  return new Response(buildCalendar(events, `BorrowBuddy · ${loan.item.title}`), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="borrowbuddy-${slug}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
