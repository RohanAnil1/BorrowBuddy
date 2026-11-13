"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import { useState } from "react";
import { MAX_IMAGE_SIZE_BYTES, MAX_ITEM_IMAGES } from "@borrowbuddy/shared";
import { createClient } from "@/lib/supabase/client";
import { BUCKETS, publicUrl } from "@/lib/storage";

/** Longest edge kept for listing photos — the item page shows them at most
 *  ~1200px wide on a 2x desktop, cards far smaller. */
const LISTING_MAX_EDGE = 1600;

/**
 * Phone cameras hand over 3–5 MB, 4000px photos; every browse card then
 * downloads that original. Re-encode listing photos in the browser before
 * upload. Anything that fails (old browser, odd format such as HEIC that
 * the browser can't decode) uploads untouched, exactly as before.
 */
async function shrinkForListing(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 350 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, LISTING_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    // JPEG has no alpha: give transparent PNGs the card's black, not grey.
    context.fillStyle = "#000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function ImageUploader({
  ownerId,
  initialPaths = [],
  name = "image_paths",
  bucket = BUCKETS.itemImages,
  max = MAX_ITEM_IMAGES,
  accept = "image/png,image/jpeg,image/webp",
  hint,
  allowedTypes,
  minBytes,
  onChange,
  shrink = bucket === BUCKETS.itemImages,
}: {
  ownerId: string;
  initialPaths?: string[];
  name?: string;
  bucket?: string;
  max?: number;
  accept?: string;
  hint?: string;
  /** Strict whitelist of MIME types (checked before upload). */
  allowedTypes?: string[];
  /** Reject files smaller than this — blurry or fake thumbnails. */
  minBytes?: number;
  onChange?: (paths: string[]) => void;
  /** Downscale photos before upload. On for listing photos only — ID
   *  scans and evidence photos stay at full resolution. */
  shrink?: boolean;
}) {
  const [paths, setPaths] = useState<string[]>(initialPaths);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);

    const supabase = createClient();
    const next = [...paths];
    const room = max - next.length;

    try {
      for (const picked of Array.from(files).slice(0, room)) {
        if (allowedTypes && !allowedTypes.includes(picked.type)) {
          setError("Only PNG and JPG images are allowed.");
          continue;
        }
        if (minBytes && picked.size < minBytes) {
          setError(`${picked.name} is too small — retake the photo.`);
          continue;
        }
        const file = shrink ? await shrinkForListing(picked) : picked;
        if (file.size > MAX_IMAGE_SIZE_BYTES) {
          setError(`${file.name} is larger than ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB.`);
          continue;
        }

        const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `${ownerId}/${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(path, file, { contentType: file.type, upsert: false });

        if (uploadError) {
          setError(uploadError.message);
          continue;
        }
        next.push(path);
      }
      setPaths(next);
      onChange?.(next);
    } finally {
      setUploading(false);
    }
  }

  function removePath(target: string) {
    const next = paths.filter((entry) => entry !== target);
    setPaths(next);
    onChange?.(next);
  }

  return (
    <div className="flex flex-col gap-3">
      <input name={name} type="hidden" value={JSON.stringify(paths)} />

      <div className="flex flex-wrap gap-3">
        {paths.map((path) => {
          const url = publicUrl(bucket, path);
          return (
            <div
              className="group relative size-24 overflow-hidden border border-line bg-black"
              key={path}
            >
              {url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="Upload" className="size-full object-cover" src={url} />
              )}
              <button
                aria-label="Remove photo"
                className="absolute right-1 top-1 flex size-7 items-center justify-center border border-line bg-black/80 text-accent transition-colors hover:bg-black"
                onClick={() => removePath(path)}
                type="button"
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}

        {paths.length < max && (
          <label className="flex size-24 cursor-pointer flex-col items-center justify-center gap-1 border border-dashed border-ink/30 text-ink/60 transition-colors hover:border-accent hover:text-accent">
            {uploading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <>
                <ImagePlus className="size-5" />
                <span className="font-secondary text-[9px]">ADD</span>
              </>
            )}
            <input
              accept={accept}
              className="hidden"
              disabled={uploading}
              multiple={max > 1}
              onChange={(event) => handleFiles(event.target.files)}
              type="file"
            />
          </label>
        )}
      </div>

      {error && <p className="font-secondary text-[10px] text-warn">[ {error} ]</p>}
      <p className="font-secondary text-[10px] text-ink/50">
        {hint?.toUpperCase() ?? `UP TO ${max} PHOTOS. THE FIRST ONE IS THE COVER.`}
      </p>
    </div>
  );
}
