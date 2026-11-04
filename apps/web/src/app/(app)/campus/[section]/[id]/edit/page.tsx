import { notFound } from "next/navigation";
import { CampusFrame } from "@/components/campus/campus-ui";
import { PostForm } from "@/components/campus/campus-forms";
import { requireVerified } from "@/lib/auth/guards";
import { campusNotes, campusPhotos, campusPost } from "@/lib/data/campus";
import { getCategories, getPickupLocations } from "@/lib/data/items";

export default async function EditCampusPost({
  params,
}: {
  params: Promise<{ section: string; id: string }>;
}) {
  const profile = await requireVerified();
  const { section, id } = await params;
  const post = await campusPost(id);
  if (
    !post ||
    post.owner_id !== profile.id ||
    post.status !== "open" ||
    section !== (post.kind === "found" ? "lost-found" : "giveaways")
  )
    notFound();
  const [categories, locations, notes, photos] = await Promise.all([
    getCategories(),
    getPickupLocations(),
    post.kind === "found" ? campusNotes(id) : Promise.resolve(null),
    campusPhotos(post.images),
  ]);
  return (
    <CampusFrame
      title="Keep the details clear."
      description="Update your open post. Active collections preserve their original details."
    >
      <div className="max-w-3xl">
        <PostForm
          key={id}
          ownerId={profile.id}
          postId={id}
          kind={post.kind}
          categories={categories}
          locations={locations}
          post={post}
          notes={notes ?? ""}
          photos={photos}
        />
      </div>
    </CampusFrame>
  );
}
