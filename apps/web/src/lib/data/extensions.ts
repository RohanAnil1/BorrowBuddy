import { createClient } from "@/lib/supabase/server";

export type LoanExtension = {
  id: string;
  loan_id: string;
  requested_by: string;
  previous_due_date: string;
  new_due_date: string;
  status: "pending" | "approved" | "declined" | "cancelled";
  message: string | null;
  created_at: string;
  responded_at: string | null;
};

/** Extension requests for one loan, newest first. Empty if the table isn't there yet. */
export async function getExtensionsForLoan(loanId: string): Promise<LoanExtension[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("loan_extensions")
    .select("*")
    .eq("loan_id", loanId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) return [];
  return (data as LoanExtension[] | null) ?? [];
}

/** Loan ids (from the given set) that have an extension waiting for an answer. */
export async function getPendingExtensionLoanIds(loanIds: string[]): Promise<Set<string>> {
  if (loanIds.length === 0) return new Set();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("loan_extensions")
    .select("loan_id")
    .eq("status", "pending")
    .in("loan_id", loanIds);
  if (error) return new Set();
  return new Set(((data as { loan_id: string }[] | null) ?? []).map((row) => row.loan_id));
}
