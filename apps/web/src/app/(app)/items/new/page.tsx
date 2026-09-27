import { ItemForm } from "@/components/app/item-form";
import { requireVerified } from "@/lib/auth/guards";
import { getCategories, getPickupLocations } from "@/lib/data/items";
import { createItem } from "../actions";

export const metadata = { title: "List an item" };

export default async function NewItemPage() {
  const profile = await requireVerified();
  const [categories, locations] = await Promise.all([getCategories(), getPickupLocations()]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 dt:px-10">
      <p className="status-bracket text-[10px]">[ NEW LISTING ]</p>
      <h1 className="type-title mt-3 text-[2rem] dt:text-[2.5rem]">Put something on the shelf</h1>
      <p className="type-body mt-2 max-w-xl text-[13px] leading-6 uppercase text-ink/60">
        Good photos and honest condition notes are what make people trust you with their
        plans.
      </p>

      <div className="mt-8">
        <ItemForm
          action={createItem}
          categories={categories}
          locations={locations}
          ownerId={profile.id}
        />
      </div>
    </div>
  );
}
