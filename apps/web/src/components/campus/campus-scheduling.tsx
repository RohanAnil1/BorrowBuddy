"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type {
  HandoverAppointment,
  HandoverSchedule,
  HandoverSlot,
  PickupLocation,
  ScheduleWindow,
} from "@borrowbuddy/shared";
import { campusDate, campusToday } from "@borrowbuddy/shared";
import { createClient } from "@/lib/supabase/client";
import { ActionForm, Label } from "./campus-forms";
import { fieldClass, secondaryClass } from "./campus-ui";

export function ScheduleEditor({
  schedule,
  locations,
}: {
  schedule: HandoverSchedule | null;
  locations: PickupLocation[];
}) {
  const [weekly, setWeekly] = useState<ScheduleWindow[]>(
    schedule?.weekly ?? [],
  );
  const [exceptions, setExceptions] = useState<ScheduleWindow[]>(
    schedule?.exceptions ?? [],
  );
  const [exceptionDate, setExceptionDate] = useState("");
  function change(day: number, patch: Partial<ScheduleWindow>) {
    setWeekly((rows) =>
      rows.map((w) => (w.day === day ? { ...w, ...patch } : w)),
    );
  }
  return (
    <ActionForm
      action="save_schedule"
      payload={{ weekly, exceptions }}
      label="SAVE MY HANDOVER HOURS"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Label text="PICKUP LOCATION">
          <select
            className={fieldClass}
            name="pickup_location_id"
            required
            defaultValue={schedule?.pickup_location_id ?? ""}
          >
            <option value="" disabled>
              Choose a campus spot
            </option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Label>
        <Label text="APPOINTMENT LENGTH">
          <select
            name="slot_minutes"
            className={fieldClass}
            defaultValue={schedule?.slot_minutes ?? 30}
          >
            {[15, 30, 60].map((n) => (
              <option key={n} value={n}>
                {n} minutes
              </option>
            ))}
          </select>
        </Label>
      </div>
      <div className="divide-y divide-line border border-line bg-black">
        {[1, 2, 3, 4, 5, 6, 0].map((day) => {
          const w = weekly.find((w) => w.day === day);
          const label = [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
          ][day];
          return (
            <div
              key={day}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-accent"
                  checked={!!w}
                  onChange={(e) =>
                    setWeekly((rows) =>
                      e.target.checked
                        ? [...rows, { day, start: "17:00", end: "19:00" }]
                        : rows.filter((w) => w.day !== day),
                    )
                  }
                />
                {label}
              </label>
              {w ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    aria-label={`${label} start`}
                    type="time"
                    className={`${fieldClass} w-auto`}
                    required
                    value={w.start}
                    onChange={(e) => change(day, { start: e.target.value })}
                  />
                  <span>TO</span>
                  <input
                    aria-label={`${label} end`}
                    type="time"
                    className={`${fieldClass} w-auto`}
                    required
                    value={w.end}
                    onChange={(e) => change(day, { end: e.target.value })}
                  />
                </div>
              ) : (
                <span className="text-xs text-ink/40">UNAVAILABLE</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="space-y-3 border border-line bg-black p-5">
        <h3 className="type-title text-xl">Date exceptions</h3>
        <p className="text-xs normal-case text-ink/60">
          A date exception replaces that day’s weekly hours. Existing
          appointments remain booked.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            aria-label="Exception date"
            type="date"
            className={`${fieldClass} w-auto`}
            value={exceptionDate}
            onChange={(e) => setExceptionDate(e.target.value)}
          />
          <button
            type="button"
            className={secondaryClass}
            onClick={() => {
              if (
                exceptionDate &&
                !exceptions.some((x) => x.date === exceptionDate)
              ) {
                setExceptions([
                  ...exceptions,
                  {
                    date: exceptionDate,
                    blocked: true,
                    start: "17:00",
                    end: "19:00",
                  },
                ]);
                setExceptionDate("");
              }
            }}
          >
            ADD DATE
          </button>
        </div>
        {exceptions.map((w, index) => (
          <div
            key={w.date}
            className="flex flex-wrap items-center gap-3 border-t border-line py-3"
          >
            <span className="font-secondary text-xs">{w.date}</span>
            <label className="flex min-h-11 items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={w.blocked}
                onChange={(e) =>
                  setExceptions((rows) =>
                    rows.map((r, i) =>
                      i === index ? { ...r, blocked: e.target.checked } : r,
                    ),
                  )
                }
              />
              BLOCK DAY
            </label>
            {!w.blocked &&
              ["start", "end"].map((key) => (
                <input
                  key={key}
                  aria-label={`${w.date} ${key}`}
                  type="time"
                  required
                  className={`${fieldClass} w-auto`}
                  value={w[key as "start" | "end"]}
                  onChange={(e) =>
                    setExceptions((rows) =>
                      rows.map((r, i) =>
                        i === index ? { ...r, [key]: e.target.value } : r,
                      ),
                    )
                  }
                />
              ))}
            <button
              className={secondaryClass}
              type="button"
              aria-label={`Remove exception ${w.date}`}
              onClick={() =>
                setExceptions((rows) => rows.filter((_, i) => i !== index))
              }
            >
              REMOVE
            </button>
          </div>
        ))}
      </div>
      <p className="text-xs text-ink/50">
        ALL TIMES: ASIA/KOLKATA (IST). STUDENTS CAN BOOK UP TO 30 DAYS AHEAD.
      </p>
    </ActionForm>
  );
}
export function AppointmentPicker({
  hostId,
  kind,
  loanId,
  transferId,
  appointments = [],
  expiresAt,
}: {
  hostId: string;
  kind: "pickup" | "return" | "collection";
  loanId?: string;
  transferId?: string;
  appointments?: HandoverAppointment[];
  expiresAt?: string | null;
}) {
  const current = appointments.find(
    (a) => a.status === "booked" && a.kind === kind,
  );
  const [date, setDate] = useState(campusToday());
  const [retry, setRetry] = useState(0);
  const key = `${hostId}:${date}:${current?.id ?? ""}:${expiresAt ?? ""}:${retry}`;
  const [result, setResult] = useState<{
    key: string;
    slots: HandoverSlot[];
    error: string;
  }>({ key: "", slots: [], error: "" });
  const loading = result.key !== key;
  const slots = result.slots;
  const error = result.error;
  const max = new Date(`${campusToday()}T00:00:00+05:30`);
  max.setUTCDate(max.getUTCDate() + 30);
  const maxDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(max);
  useEffect(() => {
    let active = true;
    void createClient()
      .rpc("campus_slots", { p_host: hostId, p_date: date })
      .then(({ data, error }) => {
        if (active)
          setResult({
            key,
            slots: error
              ? []
              : ((data ?? []) as HandoverSlot[]).filter(
                  (s) =>
                    !expiresAt || new Date(s.ends_at) <= new Date(expiresAt),
                ),
            error: error ? "Could not load available times. Please retry." : "",
          });
      });
    return () => {
      active = false;
    };
  }, [date, hostId, expiresAt, key]);
  return (
    <section
      className="space-y-4 border border-line bg-black p-5"
      style={{ overflowWrap: "anywhere" }}
      aria-label={`${kind} appointment`}
    >
      <h3 className="type-title text-2xl">
        {kind === "return" ? "Return" : "Pickup"} time
      </h3>
      {current && (
        <div className="space-y-3 border-l-2 border-accent bg-accent/10 p-4">
          <p className="font-secondary text-xs">
            BOOKED · {campusDate(current.starts_at)} –{" "}
            {new Intl.DateTimeFormat("en-IN", {
              timeZone: "Asia/Kolkata",
              hour: "numeric",
              minute: "2-digit",
            }).format(new Date(current.ends_at))}{" "}
            IST
          </p>
          <ActionForm
            action="cancel_appointment"
            payload={{ id: current.id }}
            label="CANCEL THIS APPOINTMENT"
            secondary
            confirm="This frees the slot for both members. Your loan or collection remains active."
          />
        </div>
      )}
      <Label text={current ? "RESCHEDULE TO ANOTHER DAY" : "CHOOSE A DAY"}>
        <input
          type="date"
          className={fieldClass}
          min={campusToday()}
          max={maxDate}
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
      </Label>
      {loading ? (
        <p role="status" className="animate-pulse py-4 text-sm text-ink/50">
          CHECKING AVAILABLE TIMES…
        </p>
      ) : error ? (
        <div role="alert">
          <p className="text-sm text-warn">{error}</p>
          <button
            className={secondaryClass}
            type="button"
            onClick={() => setRetry((x) => x + 1)}
          >
            RETRY
          </button>
        </div>
      ) : slots.length ? (
        <ActionForm
          action="book"
          payload={{
            kind,
            ...(loanId ? { loan_id: loanId } : { transfer_id: transferId }),
          }}
          label={current ? "RESCHEDULE HANDOVER" : "BOOK THIS TIME"}
        >
          <fieldset>
            <legend className="mb-3 text-xs text-ink/60">
              AVAILABLE START TIMES · IST
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {slots.map((slot) => (
                <label
                  key={slot.starts_at}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-line p-3 font-secondary text-xs has-checked:border-accent has-checked:bg-accent/15"
                >
                  <input
                    type="radio"
                    name="starts_at"
                    value={slot.starts_at}
                    required
                    className="accent-accent"
                  />
                  {new Intl.DateTimeFormat("en-IN", {
                    timeZone: "Asia/Kolkata",
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(new Date(slot.starts_at))}
                </label>
              ))}
            </div>
          </fieldset>
        </ActionForm>
      ) : (
        <p className="border border-dashed border-line p-4 text-sm normal-case leading-6 text-ink/60">
          No published slots fit this day
          {expiresAt ? " and your collection deadline" : ""}. Try another date
          or coordinate in your private conversation.
        </p>
      )}
      <p className="text-xs normal-case text-ink/50">
        Scheduling is optional. Your original handover code still works.{" "}
        <Link className="text-accent underline" href="/campus/handovers">
          Manage your own hours
        </Link>
        .
      </p>
    </section>
  );
}
