import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { CampusFrame } from "@/components/campus/campus-ui";
import { PostForm } from "@/components/campus/campus-forms";
import { requireVerified } from "@/lib/auth/guards";
import { getCategories, getPickupLocations } from "@/lib/data/items";

export default async function NewCampusPost({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const profile = await requireVerified();
  const { section } = await params;
  if (!["lost-found", "giveaways"].includes(section)) notFound();
  const [categories, locations] = await Promise.all([
    getCategories(),
    getPickupLocations(),
  ]);
  return (
    <CampusFrame
      title={
        section === "lost-found"
          ? "Help it find its way home."
          : "Clear your shelf. Make someone’s semester."
      }
      description="Good photos and clear details make the next step easier. You can review your post before arranging collection."
    >
      <div className="max-w-3xl">
        <PostForm
          key={section}
          ownerId={profile.id}
          postId={randomUUID()}
          kind={section === "lost-found" ? "found" : "giveaway"}
          categories={categories}
          locations={locations}
        />
      </div>
    </CampusFrame>
  );
}
