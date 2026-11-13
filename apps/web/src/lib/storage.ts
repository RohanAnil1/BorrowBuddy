import { getClientEnv } from "@/lib/env-client";

export const BUCKETS = {
  itemImages: "item-images",
  avatars: "avatars",
  studentIds: "student-ids",
  incidentPhotos: "incident-photos",
  chatImages: "chat-images",
} as const;

export function publicUrl(bucket: string, path: string | null | undefined): string | null {
  if (!path) return null;
  try {
    const env = getClientEnv();
    return `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
  } catch {
    return null;
  }
}

/**
 * ImageUploader serializes its paths as a JSON array. Server actions that
 * expect a single file (student ID) read it through this helper, which also
 * accepts a bare path for robustness.
 */
export function firstUploadPath(value: FormDataEntryValue | null): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const first = parsed.find((entry) => typeof entry === "string");
      return typeof first === "string" ? first.trim() : "";
    }
  } catch {
    // Not JSON — treat the value itself as the path.
  }

  return raw;
}
