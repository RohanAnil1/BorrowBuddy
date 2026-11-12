import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { ItemCard } from "@/components/app/item-card";
import { requireVerified } from "@/lib/auth/guards";
import { getSavedItems } from "@/lib/data/wishlist";

export const metadata = { title: "Saved items" };

export default async function SavedItemsPage() {
  const profile = await requireVerified();
  const items = await getSavedItems(profile.id);
  const available = items.filter((item) => item.status === "available").length;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 dt:px-10">
      <p className="status-bracket text-[10px]">[ SAVED FOR LATER ]</p>
      <h1 className="type-title mt-3 text-[2rem] dt:text-[2.5rem]">Saved items</h1>
      {items.length > 0 && (
        <p className="mt-2 font-secondary text-[10px] text-ink/50">
          {items.length} SAVED · {available} AVAILABLE NOW
        </p>
      )}

      <div className="mt-8">
        {items.length === 0 ? (
          <EmptyState
            action={
              <Link
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-strong text-[12px] uppercase text-white hover:opacity-90"
                href="/home"
              >
                Browse the shelf <ArrowRight className="size-4" />
              </Link>
            }
            body="Tap the heart on any item to keep it here. Handy for things you'll need later in the semester."
            code="NOTHING SAVED"
            mood="idle"
            title="No saved items yet"
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <div className="flex flex-col gap-2" key={item.id}>
                <ItemCard item={item} saved />
                {item.status !== "available" && (
                  <p className="font-secondary text-[9px] text-ink/50">[ NOT AVAILABLE RIGHT NOW ]</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
