"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { SubmitButton } from "@/components/app/submit-button";

const inputClass =
  "rounded-lg border border-line bg-black px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-accent";

export type PinDraft = {
  id?: string;
  name: string;
  description: string | null;
  xp: number | null;
  yp: number | null;
  map_label: "left" | "right";
  is_active: boolean;
};

export function PinForm({
  action,
  pin,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  pin?: PinDraft;
  submitLabel: string;
}) {
  const [xp, setXp] = useState(pin?.xp ?? 50);
  const [yp, setYp] = useState(pin?.yp ?? 42);
  const previewRef = useRef<HTMLDivElement>(null);

  const place = (clientX: number, clientY: number) => {
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nextX = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    const nextY = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));
    setXp(Math.round(nextX * 10) / 10);
    setYp(Math.round(nextY * 10) / 10);
  };

  return (
    <form action={action} className="flex flex-col gap-5" data-pin-form={pin?.id ?? "new"}>
      {pin?.id && <input name="id" type="hidden" value={pin.id} />}

      <div className="w-full max-w-md">
        <div
          aria-label="Drag or tap to place the pin on the campus map"
          className="relative cursor-crosshair touch-none select-none border border-line"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            place(event.clientX, event.clientY);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              place(event.clientX, event.clientY);
            }
          }}
          ref={previewRef}
          role="application"
        >
          <Image
            alt=""
            className="pointer-events-none h-auto w-full"
            height={750}
            src="/campus-map.png"
            width={1000}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#0c0906] bg-[#ffcf7a]"
            style={{ left: `${xp}%`, top: `${yp}%` }}
          />
        </div>
        <p className="font-secondary mt-2 text-[9px] text-ink/40">
          DRAG THE DOT TO PLACE THE PIN — {xp.toFixed(1)}% / {yp.toFixed(1)}%
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-full min-w-0 flex-1 flex-col gap-1.5 sm:w-auto sm:min-w-56">
          <span className="font-secondary text-[9px] text-ink/50">NAME</span>
          <input
            className={inputClass}
            defaultValue={pin?.name ?? ""}
            maxLength={60}
            minLength={3}
            name="name"
            placeholder="Maggi Hotspot"
            required
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-secondary text-[9px] text-ink/50">X %</span>
          <input
            className={`${inputClass} w-24`}
            max={100}
            min={0}
            name="xp"
            onChange={(event) => setXp(Number(event.target.value))}
            step={0.1}
            type="number"
            value={xp}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-secondary text-[9px] text-ink/50">Y %</span>
          <input
            className={`${inputClass} w-24`}
            max={100}
            min={0}
            name="yp"
            onChange={(event) => setYp(Number(event.target.value))}
            step={0.1}
            type="number"
            value={yp}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-full min-w-0 flex-1 flex-col gap-1.5 sm:w-auto sm:min-w-56">
          <span className="font-secondary text-[9px] text-ink/50">DESCRIPTION</span>
          <input
            className={inputClass}
            defaultValue={pin?.description ?? ""}
            maxLength={200}
            name="description"
            placeholder="Eatery counter in front of Block C1"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-secondary text-[9px] text-ink/50">LABEL SIDE</span>
          <select className={inputClass} defaultValue={pin?.map_label ?? "right"} name="map_label">
            <option value="left">Left of the pin</option>
            <option value="right">Right of the pin</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2.5">
          <input
            className="size-4 accent-accent"
            defaultChecked={pin?.is_active ?? true}
            name="is_active"
            type="checkbox"
          />
          <span className="font-secondary text-[9px] text-ink/50">ON THE BOARD</span>
        </label>
      </div>

      <div>
        <SubmitButton pendingLabel="SAVING…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
