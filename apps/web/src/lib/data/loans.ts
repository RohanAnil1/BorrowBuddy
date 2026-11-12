import type { Item, Loan, LoanStatus, Profile } from "@borrowbuddy/shared";
import { createClient } from "@/lib/supabase/server";

export type LoanSummary = Loan & {
  item: Pick<Item, "id" | "title" | "images" | "deposit_amount"> & {
    pickup_location?: { name: string } | null;
  };
  owner: Pick<Profile, "id" | "full_name" | "avatar_path" | "trust_score">;
  borrower: Pick<Profile, "id" | "full_name" | "avatar_path" | "trust_score">;
};

const LOAN_SELECT = `
  id, request_id, item_id, owner_id, borrower_id, start_date, due_date, returned_at,
  status, handover_token_expires_at, return_token_expires_at, handover_attempts,
  return_attempts, pickup_confirmed_at, return_confirmed_at, created_at, updated_at,
  item:items!loans_item_id_fkey (id, title, images, deposit_amount, pickup_location:pickup_locations (name)),
  owner:profiles!loans_owner_id_fkey (id, full_name, avatar_path, trust_score),
  borrower:profiles!loans_borrower_id_fkey (id, full_name, avatar_path, trust_score)
`;

const OPEN_STATUSES: LoanStatus[] = ["awaiting_pickup", "active", "return_pending", "overdue", "disputed"];

export async function getLoan(id: string): Promise<LoanSummary | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("loans").select(LOAN_SELECT).eq("id", id).maybeSingle();
  return (data as LoanSummary | null) ?? null;
}

export async function getLoansForUser(userId: string): Promise<{
  asBorrower: LoanSummary[];
  asOwner: LoanSummary[];
}> {
  const supabase = await createClient();

  const [borrowerResult, ownerResult] = await Promise.all([
    supabase
      .from("loans")
      .select(LOAN_SELECT)
      .eq("borrower_id", userId)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("loans")
      .select(LOAN_SELECT)
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(60),
  ]);

  return {
    asBorrower: (borrowerResult.data as LoanSummary[] | null) ?? [],
    asOwner: (ownerResult.data as LoanSummary[] | null) ?? [],
  };
}

export function isOpenLoan(status: LoanStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

export function isOverdue(loan: Pick<Loan, "status" | "due_date">): boolean {
  return loan.status === "overdue" || (isOpenLoan(loan.status) && loan.due_date < today());
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
