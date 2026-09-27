import { ItemForm } from "@/components/app/item-form";
import { requireVerified } from "@/lib/auth/guards";
import { getCategories, getItem, getPickupLocations } from "@/lib/data/items";
import { notFound, redirect } from "next/navigation";
import { updateItem } from "../../actions";

export const metadata = { title: "Edit listing" };

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireVerified();
  const { id } = await params;

  const item = await getItem(id);
  if (!item) notFound();
  if (item.owner_id !== profile.id) redirect(`/items/${id}`);

  const [categories, locations] = await Promise.all([getCategories(), getPickupLocations()]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 dt:px-10">
      <p className="status-bracket text-[10px]">[ EDIT MANIFEST ]</p>
      <h1 className="type-title mt-3 text-[2rem] dt:text-[2.5rem]">{item.title}</h1>

      <div className="mt-8">
        <ItemForm
          action={updateItem}
          categories={categories}
          item={item}
          locations={locations}
          ownerId={profile.id}
        />
      </div>
    </div>
  );
}
