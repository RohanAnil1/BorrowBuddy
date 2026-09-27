import { getClientEnv } from "@/lib/env";

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
