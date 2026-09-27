import { ImageOff, MapPin } from "lucide-react";
import Link from "next/link";
import type { ItemWithOwner } from "@borrowbuddy/shared";
import { conditionLabel, formatMoney } from "@/lib/format";
import { BUCKETS, publicUrl } from "@/lib/storage";

export function ItemCard({ item }: { item: ItemWithOwner }) {
  const cover = publicUrl(BUCKETS.itemImages, item.images[0]);

  return (
    <Link
      className="group flex flex-col overflow-hidden border border-line bg-panel transition-colors hover:border-accent"
      href={`/items/${item.id}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-black">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={item.title}
            className="size-full object-cover transition duration-700 group-hover:scale-[1.03]"
            loading="lazy"
            src={cover}
          />
        ) : (
          <span className="flex size-full items-center justify-center text-ink/40">
            <ImageOff className="size-8" />
          </span>
        )}
        <span className="absolute left-3 top-3 bg-black px-2 py-1 font-secondary text-[9px] uppercase text-accent">
          {conditionLabel(item.condition).toUpperCase()}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="type-body-alt text-[16px] uppercase leading-snug">{item.title}</h3>
        <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-ink/50">
          {item.description}
        </p>

        <div className="mt-4 flex items-center justify-between font-secondary text-[9px] text-ink/50">
          <span className="flex items-center gap-1.5">
            <span className="text-accent">★</span>
            {Math.round(item.owner.trust_score)}
          </span>
          {item.pickup_location && (
            <span className="flex items-center gap-1 truncate">
              <MapPin className="size-3" />
              <span className="truncate">{item.pickup_location.name.toUpperCase()}</span>
            </span>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
          <span className="font-secondary text-[9px] uppercase text-ink/50">
            {item.owner.full_name}
          </span>
          <span className="font-secondary text-[9px] text-accent">
            DEP {formatMoney(item.deposit_amount)}
          </span>
        </div>
      </div>
    </Link>
  );
}
