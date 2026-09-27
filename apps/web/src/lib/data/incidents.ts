import type { Incident, IncidentPhoto, Profile } from "@borrowbuddy/shared";
import { createClient } from "@/lib/supabase/server";

export type IncidentWithReporter = Incident & {
  reporter: Pick<Profile, "id" | "full_name"> | null;
  photos: IncidentPhoto[];
  loan?: {
    id: string;
    item_title: string | null;
    borrower_id: string;
    owner_id: string;
    borrower_name: string | null;
    owner_name: string | null;
  } | null;
};

export async function getIncidentsForLoan(loanId: string): Promise<IncidentWithReporter[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("incidents")
    .select(
      "*, reporter:profiles!incidents_reporter_id_fkey(id, full_name), photos:incident_photos(*)",
    )
    .eq("loan_id", loanId)
    .order("created_at", { ascending: false });

  return (data as IncidentWithReporter[] | null) ?? [];
}

export async function getOpenIncidents(limit = 30): Promise<IncidentWithReporter[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("incidents")
    .select(
      "*, reporter:profiles!incidents_reporter_id_fkey(id, full_name), photos:incident_photos(*), loan:loans(id, borrower_id, owner_id, borrower:profiles!loans_borrower_id_fkey(full_name), owner:profiles!loans_owner_id_fkey(full_name), item:items(title))",
    )
    .in("status", ["open", "under_review"])
    .order("created_at", { ascending: true })
    .limit(limit);

  return ((data as unknown as (IncidentWithReporter & {
    loan: {
      id: string;
      borrower_id: string;
      owner_id: string;
      borrower: { full_name: string } | null;
      owner: { full_name: string } | null;
      item: { title: string } | null;
    } | null;
  })[] | null) ?? []).map((row) => ({
    ...row,
    loan: row.loan
      ? {
          id: row.loan.id,
          borrower_id: row.loan.borrower_id,
          owner_id: row.loan.owner_id,
          borrower_name: row.loan.borrower?.full_name ?? null,
          owner_name: row.loan.owner?.full_name ?? null,
          item_title: row.loan.item?.title ?? null,
        }
      : null,
  }));
}
