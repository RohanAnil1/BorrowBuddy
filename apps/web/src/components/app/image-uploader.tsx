"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import { useState } from "react";
import { MAX_IMAGE_SIZE_BYTES, MAX_ITEM_IMAGES } from "@borrowbuddy/shared";
import { createClient } from "@/lib/supabase/client";
import { BUCKETS, publicUrl } from "@/lib/storage";

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
      for (const file of Array.from(files).slice(0, room)) {
        if (allowedTypes && !allowedTypes.includes(file.type)) {
          setError("Only PNG and JPG images are allowed.");
          continue;
        }
        if (minBytes && file.size < minBytes) {
          setError(`${file.name} is too small — retake the photo.`);
          continue;
        }
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
                className="absolute right-1 top-1 flex size-6 items-center justify-center bg-black text-accent opacity-0 transition-opacity group-hover:opacity-100"
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
