import {
  Box,
  Camera,
  Dumbbell,
  Fan,
  Gamepad2,
  Laptop,
  Book,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import type { Category } from "@borrowbuddy/shared";
import type { LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  laptop: Laptop,
  camera: Camera,
  gamepad: Gamepad2,
  dumbbell: Dumbbell,
  book: Book,
  wrench: Wrench,
  fan: Fan,
  box: Box,
};

export function CategoryGrid({ categories }: { categories: Category[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {categories.map((category) => {
        const Icon = ICONS[category.icon] ?? Box;
        return (
          <Link
            className="flex flex-col items-start gap-6 border border-line bg-panel p-4 transition-colors hover:border-accent"
            href={`/home?category=${category.id}`}
            key={category.id}
          >
            <Icon className="size-6 text-accent" />
            <span className="font-secondary text-[10px] text-ink">
              {category.name.toUpperCase()}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
