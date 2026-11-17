import { redirect } from "next/navigation";

/** Claims review moved into the admin console. */
export default function CampusAdminRedirect() {
  redirect("/admin/claims");
}
