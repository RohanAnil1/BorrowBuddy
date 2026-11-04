import { redirect } from "next/navigation";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  // A self-contained document also works on the first offline navigation,
  // before any React route chunks have been downloaded.
  redirect("/offline.html");
}
