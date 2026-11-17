import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import { Drawer } from "@/components/admin/drawer";
import { PageHeader, Panel } from "@/components/admin/ui";
import { ConfirmSubmit } from "@/components/app/confirm-submit";
import { EmptyState } from "@/components/app/empty-state";
import { PinForm } from "@/components/app/pin-form";
import { StatusBadge } from "@/components/app/status-badge";
import { requireAdmin } from "@/lib/auth/guards";
import { getAllPickupLocations } from "@/lib/data/items";
import { cn } from "@/lib/utils";
import { removePin, savePin } from "../pins-actions";

export const metadata = { title: "Pickup spots · Admin" };

export default async function PinsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  await requireAdmin();
  const { new: openNew } = await searchParams;
  const locations = await getAllPickupLocations();
  const mapped = locations.filter((location) => location.xp !== null && location.yp !== null);
  const live = locations.filter((location) => location.is_active).length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        actions={
          <Drawer
            defaultOpen={openNew === "1"}
            eyebrow="NEW PICKUP SPOT"
            icon={<Plus aria-hidden className="size-4" />}
            label="Add spot"
            title="Add a pickup spot"
            variant="primary"
          >
            <PinForm action={savePin} submitLabel="Add spot" />
          </Drawer>
        }
        description="Where students meet to hand things over. Spots on the board show up on the landing page map and in every listing's pickup choices within a minute."
        eyebrow={`CAMPUS · ${live} ON THE BOARD`}
        title="Pickup spots"
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Panel bodyClassName="p-3" icon={<MapPin aria-hidden className="size-3.5" />} title="The board">
          <figure>
            <div className="relative overflow-hidden border border-line">
              <Image
                alt="Bennett University campus map with every pickup spot marked"
                className="h-auto w-full"
                height={750}
                priority
                sizes="(min-width: 1280px) 40rem, 100vw"
                src="/campus-map.png"
                width={1000}
              />
              {mapped.map((location) => (
                <a
                  aria-label={`${location.name}${location.is_active ? "" : " (hidden)"}`}
                  className="group absolute -translate-x-1/2 -translate-y-1/2"
                  href={`#pin-${location.id}`}
                  key={location.id}
                  style={{ left: `${location.xp}%`, top: `${location.yp}%` }}
                >
                  <span
                    className={cn(
                      "block size-3.5 rounded-full border-2 border-[#0c0906] transition-transform group-hover:scale-125",
                      location.is_active ? "bg-[#ffcf7a]" : "bg-ink/40",
                    )}
                  />
                  <span
                    className={cn(
                      "font-secondary pointer-events-none absolute top-1/2 hidden -translate-y-1/2 whitespace-nowrap border border-line bg-black/90 px-1.5 py-0.5 text-[11px] text-ink group-hover:block group-focus-visible:block",
                      location.map_label === "left" ? "right-5" : "left-5",
                    )}
                  >
                    {location.name}
                  </span>
                </a>
              ))}
            </div>
            <figcaption className="font-secondary mt-2 flex flex-wrap items-center gap-4 px-1 text-[11px] text-ink/60">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-full border border-[#0c0906] bg-[#ffcf7a]" /> On the board
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-full border border-[#0c0906] bg-ink/40" /> Hidden
              </span>
              <span>{locations.length - mapped.length} without a map position</span>
            </figcaption>
          </figure>
        </Panel>

        <Panel bodyClassName="p-0" count={locations.length} title="All spots">
          {locations.length === 0 ? (
            <EmptyState
              body="Add the first spot where students can meet for handovers."
              className="border-0"
              code="NO SPOTS"
              compact
              icon={<MapPin className="size-7" />}
              title="No pickup spots yet"
            />
          ) : (
            <ul className="divide-y divide-line">
              {locations.map((location) => (
                <li className="scroll-mt-32 p-4 target:bg-accent/10" id={`pin-${location.id}`} key={location.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-[15px] normal-case">
                        {location.name}
                        <StatusBadge tone={location.is_active ? "success" : "muted"}>
                          {location.is_active ? "On the board" : "Hidden"}
                        </StatusBadge>
                      </p>
                      <p className="mt-0.5 text-[13px] normal-case text-ink/60">
                        {location.description || "No description"}
                      </p>
                      <p className="font-secondary mt-1 text-[11px] text-ink/50">
                        {location.xp !== null && location.yp !== null
                          ? `Map ${location.xp.toFixed(1)}% · ${location.yp.toFixed(1)}% · label ${location.map_label}`
                          : "No map position"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Drawer
                        eyebrow="EDIT PICKUP SPOT"
                        icon={<Pencil aria-hidden className="size-3.5" />}
                        label="Edit"
                        size="sm"
                        title={location.name}
                      >
                        <PinForm action={savePin} pin={{ ...location }} submitLabel="Save spot" />
                      </Drawer>
                      <form action={removePin}>
                        <input name="id" type="hidden" value={location.id} />
                        <ConfirmSubmit
                          className="min-h-9 px-3 text-[12px]"
                          confirmLabel="Remove spot"
                          message={`${location.name} is deleted from the map and from pickup choices, and listings that used it lose their pickup spot. To take it off the map for a while, edit it and untick "On the board" instead.`}
                          pendingLabel="…"
                          title={`Remove ${location.name}?`}
                        >
                          <Trash2 aria-hidden className="size-3.5" />
                          <span className="sr-only">Remove {location.name}</span>
                        </ConfirmSubmit>
                      </form>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
