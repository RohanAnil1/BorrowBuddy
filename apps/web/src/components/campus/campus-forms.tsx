"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, X } from "lucide-react";
import type { CampusPost, Category, PickupLocation } from "@borrowbuddy/shared";
import { campusDate, campusToday } from "@borrowbuddy/shared";
import { campusAction } from "@/app/(app)/campus/actions";
import { createClient } from "@/lib/supabase/client";
import { QrCodeTile } from "@/components/app/qr-code";
import { buttonClass, fieldClass, secondaryClass } from "./campus-ui";

export function ActionForm({
  action,
  payload = {},
  label,
  pendingLabel = "SAVING…",
  children,
  confirm,
  secondary = false,
  disabled = false,
}: {
  action: string;
  payload?: Record<string, unknown>;
  label: string;
  pendingLabel?: string;
  children?: React.ReactNode;
  confirm?: string;
  secondary?: boolean;
  disabled?: boolean;
}) {
  const [state, submit, pending] = useActionState(campusAction, {
    status: "idle",
  });
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (state.status === "success" && !state.code) {
      if (state.href) router.push(state.href);
      else router.refresh();
    }
  }, [state, router]);
  return (
    <form
      action={submit}
      className="space-y-4"
      aria-busy={pending || disabled}
      onSubmit={(event) => {
        if (disabled) event.preventDefault();
      }}
    >
      <input name="action" type="hidden" value={action} />
      {Object.entries(payload).map(([key, value]) => (
        <input
          key={key}
          name={key}
          type="hidden"
          value={
            typeof value === "object"
              ? JSON.stringify(value)
              : String(value ?? "")
          }
        />
      ))}
      {children}
      {state.status !== "idle" && !pending && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={`border px-4 py-3 text-sm normal-case ${state.status === "error" ? "border-warn text-warn" : "border-accent/50 text-ink"}`}
        >
          {state.message}
        </p>
      )}
      {state.code && !pending && (
        <div className="flex flex-col items-center gap-4 border border-accent/50 bg-deep p-6">
          <QrCodeTile
            payload={`bb:collection:${state.code}`}
            label="Collection QR"
          />
          <p
            className="font-ticket text-3xl tracking-[.3em]"
            data-testid="collection-code"
          >
            {state.code}
          </p>
          <p className="text-center text-xs text-ink/60">
            ONE USE · EXPIRES {state.expires && campusDate(state.expires)}
            <br />
            SHOW ONLY TO THE FINDER OR DONOR AT COLLECTION.
          </p>
        </div>
      )}
      <button
        className={
          secondary ? secondaryClass : `${buttonClass} w-full sm:w-auto`
        }
        disabled={pending || disabled}
        type={confirm ? "button" : "submit"}
        onClick={confirm ? () => dialog.current?.showModal() : undefined}
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        {pending ? pendingLabel : label}
      </button>
      {confirm && (
        <dialog
          ref={dialog}
          aria-labelledby={titleId}
          className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-line bg-black p-6 text-ink backdrop:bg-black/75"
        >
          <h2 id={titleId} className="type-title text-2xl">
            {label}
          </h2>
          <p className="my-5 text-sm leading-6 normal-case text-ink/70">
            {confirm}
          </p>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              className={secondaryClass}
              onClick={() => dialog.current?.close()}
            >
              GO BACK
            </button>
            <button
              type="submit"
              disabled={pending || disabled}
              className={buttonClass}
              onClick={() => dialog.current?.close()}
            >
              CONFIRM
            </button>
          </div>
        </dialog>
      )}
    </form>
  );
}
export function Label({
  text,
  children,
  hint,
}: {
  text: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="font-secondary text-[11px] text-ink/70">{text}</span>
      {children}
      {hint && (
        <span className="block text-xs leading-5 normal-case text-ink/50">
          {hint}
        </span>
      )}
    </label>
  );
}
export function Deadline({ value }: { value: string }) {
  const [remaining, setRemaining] = useState<string>(
    "Checking collection deadline…",
  );
  useEffect(() => {
    const tick = () => {
      const n = Math.max(0, new Date(value).getTime() - Date.now());
      setRemaining(
        n
          ? `${Math.floor(n / 3600000)}H ${Math.floor(n / 60000) % 60}M LEFT`
          : "RESERVATION EXPIRED",
      );
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [value]);
  return (
    <div className="border-l-2 border-accent bg-accent/10 p-4">
      <p className="font-secondary text-sm text-accent" aria-live="off">
        {remaining}
      </p>
      <p className="mt-2 text-xs text-ink/65">
        COLLECT BY {campusDate(value)} IST
      </p>
    </div>
  );
}
export function ReservationPreview({ hours }: { hours: number }) {
  const [deadline, setDeadline] = useState<string | null>(null);
  useEffect(() => {
    const update = () =>
      setDeadline(new Date(Date.now() + hours * 3600000).toISOString());
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, [hours]);
  return (
    <p className="mb-5 border-l-2 border-accent pl-4 text-xs normal-case leading-6 text-ink/70">
      {deadline
        ? `Reserve now → collect by approximately ${campusDate(deadline)} IST.`
        : `You will have ${hours} hours from confirmation to collect.`}
      <span className="block text-ink/50">
        Your exact deadline is set when the reservation succeeds.
      </span>
    </p>
  );
}
function PhotoPicker({
  ownerId,
  postId,
  initial = [],
  initialUrls = {},
  onBusy,
}: {
  ownerId: string;
  postId: string;
  initial?: string[];
  initialUrls?: Record<string, string>;
  onBusy: (busy: boolean) => void;
}) {
  const [photos, setPhotos] = useState(
    initial.map((path) => ({ path, url: initialUrls[path] })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function upload(files: FileList | null) {
    if (!files) return;
    setBusy(true);
    onBusy(true);
    setError("");
    const next = [...photos];
    const db = createClient();
    try {
      for (const file of Array.from(files).slice(0, 6 - photos.length)) {
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 5 * 1024 * 1024
        )
          throw new Error("Choose JPG, PNG or WebP photos up to 5 MB.");
        // Re-encoding removes embedded location metadata from found-item photos.
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas
          .getContext("2d")!
          .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) =>
              b ? resolve(b) : reject(new Error("Photo conversion failed.")),
            "image/webp",
            0.88,
          ),
        );
        const path = `${ownerId}/${postId}/${crypto.randomUUID()}.webp`;
        const { error: uploadError } = await db.storage
          .from("campus-photos")
          .upload(path, blob, { contentType: "image/webp" });
        if (uploadError) throw uploadError;
        const { data, error: previewError } = await db.storage
          .from("campus-photos")
          .createSignedUrl(path, 3600);
        if (previewError) throw previewError;
        next.push({ path, url: data.signedUrl });
        setPhotos([...next]);
      }
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : "Upload failed. Your other photos are retained; please retry.";
      setError(
        /fetch|network|connection/i.test(message)
          ? "Upload interrupted. Your other photos and inputs are retained; reconnect and try again."
          : message,
      );
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <input
        type="hidden"
        name="images"
        value={JSON.stringify(photos.map((x) => x.path))}
      />
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {photos.map((photo) => (
          <div
            className="relative aspect-square overflow-hidden border border-line bg-deep"
            key={photo.path}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt="Upload preview"
              className="size-full object-cover"
            />
            <button
              aria-label="Remove photo"
              type="button"
              disabled={busy}
              className="absolute right-1 top-1 flex min-h-11 min-w-11 items-center justify-center rounded bg-black p-2"
              onClick={() => {
                setPhotos(photos.filter((p) => p.path !== photo.path));
                if (!initial.includes(photo.path))
                  void createClient()
                    .storage.from("campus-photos")
                    .remove([photo.path]);
              }}
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <label className={`${secondaryClass} cursor-pointer`}>
        <Camera className="size-4" />
        {busy ? "UPLOADING…" : `ADD PHOTOS · ${photos.length}/6`}
        <input
          aria-label="Campus photos"
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={busy || photos.length >= 6}
          onChange={(e) => {
            void upload(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      <p className="text-xs normal-case text-ink/50">
        At least one photo. Up to six, 5 MB each. Photos are visible to verified
        campus members. Avoid showing serial numbers or private documents.
      </p>
      {error && (
        <p role="alert" className="text-sm normal-case text-warn">
          {error}
        </p>
      )}
      {busy && (
        <p role="status" className="text-xs text-accent">
          WAIT FOR UPLOADS TO FINISH BEFORE PUBLISHING.
        </p>
      )}
    </div>
  );
}
export function PostForm({
  ownerId,
  postId,
  kind,
  categories,
  locations,
  post,
  notes,
  photos,
}: {
  ownerId: string;
  postId: string;
  kind: "found" | "giveaway";
  categories: Category[];
  locations: PickupLocation[];
  post?: CampusPost;
  notes?: string;
  photos?: Record<string, string>;
}) {
  const [uploading, setUploading] = useState(false);
  return (
    <ActionForm
      action="save_post"
      disabled={uploading}
      payload={{ id: postId, kind }}
      label={post ? "SAVE CHANGES" : "PUBLISH TO CAMPUS"}
    >
      <div className="border border-line bg-black p-5 sm:p-7">
        <PhotoPicker
          ownerId={ownerId}
          postId={postId}
          initial={post?.images}
          initialUrls={photos}
          onBusy={setUploading}
        />
      </div>
      <div className="grid grid-cols-1 gap-5 border border-line bg-black p-5 sm:p-7">
        <Label text="WHAT IS IT?">
          <input
            className={fieldClass}
            name="title"
            required
            minLength={3}
            maxLength={100}
            defaultValue={post?.title}
            placeholder={
              kind === "found"
                ? "Blue water bottle near the library"
                : "Textbooks ready for their next semester"
            }
          />
        </Label>
        <Label text="DESCRIPTION">
          <textarea
            className={fieldClass}
            name="description"
            required
            minLength={10}
            maxLength={2000}
            rows={4}
            defaultValue={post?.description}
            placeholder="Describe the item and its condition."
          />
        </Label>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Label text="CATEGORY">
            <select
              className={fieldClass}
              name="category_id"
              required
              defaultValue={post?.category_id ?? ""}
            >
              <option value="" disabled>
                Choose a category
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Label>
          <Label text="APPROXIMATE CAMPUS LOCATION">
            <input
              className={fieldClass}
              name="location"
              required
              minLength={2}
              maxLength={100}
              defaultValue={post?.location}
              placeholder="Library area / Hostel B"
            />
          </Label>
        </div>
        <Label text="PREFERRED PICKUP SPOT">
          <select
            className={fieldClass}
            name="pickup_location_id"
            defaultValue={post?.pickup_location_id ?? ""}
          >
            <option value="">
              Choose later in your collection conversation
            </option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Label>
        {kind === "found" ? (
          <>
            <Label text="DATE FOUND">
              <input
                className={fieldClass}
                name="found_on"
                type="date"
                required
                max={campusToday()}
                defaultValue={post?.found_on ?? campusToday()}
              />
            </Label>
            <Label
              text="PRIVATE IDENTIFYING NOTES"
              hint="Only you and campus admins can read these notes. Mention hidden markings, contents or other details that can verify ownership."
            >
              <textarea
                className={fieldClass}
                name="identifying_notes"
                required
                minLength={5}
                maxLength={2000}
                rows={4}
                defaultValue={notes}
              />
            </Label>
          </>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Label text="CONDITION">
              <select
                className={fieldClass}
                name="condition"
                defaultValue={post?.condition ?? "good"}
              >
                {["new", "good", "fair", "worn"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Label>
            <Label
              text="COLLECTION RESERVATION"
              hint="The first eligible student gets this long to collect. A booking does not extend the deadline."
            >
              <select
                className={fieldClass}
                name="hold_hours"
                defaultValue={post?.hold_hours ?? 48}
              >
                {[24, 48, 72].map((h) => (
                  <option key={h} value={h}>
                    {h} hours
                  </option>
                ))}
              </select>
            </Label>
          </div>
        )}
      </div>
    </ActionForm>
  );
}
