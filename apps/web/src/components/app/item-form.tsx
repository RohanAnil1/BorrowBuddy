"use client";

import { useActionState, useState } from "react";
import type { Category, ItemCondition, ItemWithOwner, PickupLocation } from "@borrowbuddy/shared";
import { ITEM_CONDITION_LABELS, MAX_LOAN_DAYS, MIN_LOAN_DAYS } from "@borrowbuddy/shared";
import type { ActionState } from "@/lib/action-state";
import { idleState } from "@/lib/action-state";
import { ImageUploader } from "./image-uploader";
import { SubmitButton } from "./submit-button";
import { TicketTopBar } from "@/components/landing/hero";

const inputClass =
  "w-full rounded-lg border border-line bg-black px-4 py-3 text-[14px] text-ink outline-none transition-colors focus:border-accent";
const labelClass = "font-secondary text-[10px] text-ink/50";

export function ItemForm({
  action,
  categories,
  locations,
  ownerId,
  item,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  categories: Category[];
  locations: PickupLocation[];
  ownerId: string;
  item?: ItemWithOwner;
}) {
  const [state, formAction] = useActionState(action, idleState);
  // Publish stays locked until the first photo lands in the item-images bucket.
  const [photoCount, setPhotoCount] = useState(item?.images.length ?? 0);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {item && <input name="item_id" type="hidden" value={item.id} />}

      <section className="flex flex-col gap-5 border border-line bg-panel p-6">
        <TicketTopBar />
        <h2 className="font-secondary mt-2 text-[11px] uppercase text-ink/60">[ THE BASICS ]</h2>

        <label className="flex flex-col gap-2">
          <span className={labelClass}>TITLE</span>
          <input
            className={inputClass}
            defaultValue={item?.title ?? ""}
            maxLength={100}
            name="title"
            placeholder="Sony A7 III camera"
            required
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className={labelClass}>DESCRIPTION</span>
          <textarea
            className="min-h-32 w-full rounded-lg border border-line bg-black px-4 py-3 text-[14px] outline-none transition-colors focus:border-accent"
            defaultValue={item?.description ?? ""}
            maxLength={2000}
            name="description"
            placeholder="What is it, what's included, and any rules borrowers should know."
            required
          />
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className={labelClass}>CATEGORY</span>
            <select
              className={inputClass}
              defaultValue={item?.category_id ?? ""}
              name="category_id"
              required
            >
              <option value="">Choose a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className={labelClass}>CONDITION</span>
            <select
              className={inputClass}
              defaultValue={item?.condition ?? "good"}
              name="condition"
            >
              {(Object.keys(ITEM_CONDITION_LABELS) as ItemCondition[]).map((condition) => (
                <option key={condition} value={condition}>
                  {ITEM_CONDITION_LABELS[condition]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <label className="flex flex-col gap-2">
            <span className={labelClass}>DEPOSIT (INR)</span>
            <input
              className={inputClass}
              defaultValue={item?.deposit_amount ?? 0}
              min={0}
              name="deposit_amount"
              step={50}
              type="number"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className={labelClass}>MAX LOAN DAYS</span>
            <input
              className={inputClass}
              defaultValue={item?.max_loan_days ?? 14}
              max={MAX_LOAN_DAYS}
              min={MIN_LOAN_DAYS}
              name="max_loan_days"
              type="number"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className={labelClass}>PICKUP SPOT</span>
            <select
              className={inputClass}
              defaultValue={item?.pickup_location_id ?? ""}
              name="pickup_location_id"
            >
              <option value="">Not decided</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-5 border border-line bg-panel p-6">
        <h2 className="font-secondary text-[11px] uppercase text-ink/60">[ PHOTOS ]</h2>
        <ImageUploader
          initialPaths={item?.images ?? []}
          onChange={(paths) => setPhotoCount(paths.length)}
          ownerId={ownerId}
        />
      </section>

      {state.status === "error" && (
        <p className="border border-warn/50 bg-warn/10 px-4 py-3 font-secondary text-[10px] leading-5 text-warn">
          [ {state.message} ]
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton disabled={photoCount === 0} pendingLabel="SAVING…">
          {item ? "Save changes" : "Publish listing"}
        </SubmitButton>
        <p className="font-secondary text-[9px] text-ink/40">
          {photoCount === 0
            ? "ADD AT LEAST ONE PHOTO TO PUBLISH."
            : "YOU CAN PAUSE OR EDIT THIS LISTING AT ANY TIME."}
        </p>
      </div>
    </form>
  );
}
