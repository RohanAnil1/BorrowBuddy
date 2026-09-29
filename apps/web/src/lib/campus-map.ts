/* ---------------------------------------------------------------------------
   Bennett University master plan — shared data for the campus board, used by
   the landing page and the in-app pickup map. Everything is expressed as a
   percentage of the 4000 × 3000 photograph, so a pin can be nudged with two
   numbers: xp runs left to right, yp top to bottom. Positions are traced from
   the printed plan (north-up: Gates 1/2 on the east approach road, Gate 3
   west, sports belt north-west, academic core centre, hostel cluster east,
   fields south).

   The list below is the static fallback used when the database is not wired
   up; once it is, active pickup_locations rows with coordinates render here
   and the admin desk can add or remove pins.
   --------------------------------------------------------------------------- */

export const IMAGE = { w: 4000, h: 3000 } as const;

export type MapSpot = {
  id: string;
  name: string;
  description: string;
  /** % of image width */
  xp: number;
  /** % of image height */
  yp: number;
  /** which side the label chip sits on */
  label: "left" | "right";
  /** optional decorative live count when a source provides one */
  live?: number;
  /** optional photo of the spot, shown on the pin card */
  photo?: string;
};

/**
 * Photos of the five pinned spots, kept as static web copies in
 * public/spots (originals live in Design/). Database rows win when their
 * photo_path is set; otherwise the board falls back to this lookup by name,
 * so the images appear even before the column is seeded.
 */
export const SPOT_PHOTOS: Record<string, string> = {
  "maggi hotspot": "/spots/maggi-hotspot.jpg",
  "southern stories": "/spots/southern-stories.jpg",
  "d5 stage": "/spots/d5-stage.jpg",
  laundry: "/spots/laundry.jpg",
  quench: "/spots/quench.jpg",
};

export function spotPhoto(name: string): string | undefined {
  return SPOT_PHOTOS[name.trim().toLowerCase()];
}

export const SPOTS: MapSpot[] = [
  {
    id: "maggi-hotspot",
    name: "Maggi Hotspot",
    description: "Eatery counter in front of Block C1",
    xp: 38.8,
    yp: 44.4,
    label: "right",
    photo: "/spots/maggi-hotspot.jpg",
  },
  {
    id: "southern-stories",
    name: "Southern Stories",
    description: "Eatery counter in front of Block D1",
    xp: 38.8,
    yp: 41.3,
    label: "left",
    photo: "/spots/southern-stories.jpg",
  },
  {
    id: "d5-stage",
    name: "D5 Stage",
    description: "Open-air stage in front of Block D5",
    xp: 37.5,
    yp: 35.7,
    label: "left",
    photo: "/spots/d5-stage.jpg",
  },
  {
    id: "laundry",
    name: "Laundry",
    description: "Laundry drop between Blocks D4 and D2",
    xp: 42.0,
    yp: 36.6,
    label: "right",
    photo: "/spots/laundry.jpg",
  },
  {
    id: "quench",
    name: "Quench",
    description: "Eatery counter in front of the Sports Complex",
    xp: 29.7,
    yp: 33.6,
    label: "left",
    photo: "/spots/quench.jpg",
  },
];

/** Walk-in anchor: the Gate 1 opening on the west side of the approach road. */
export const GATE_1 = { xp: 65.6, yp: 42.4 } as const;

/** Dashed arrival path from Gate 1 to a pickup pin, in the photo's own
    aspect (viewBox 1000 × 750, exactly 4:3). */
export function routePath(spot: Pick<MapSpot, "xp" | "yp">): string {
  const gx = GATE_1.xp * 10;
  const gy = GATE_1.yp * 7.5;
  const x = spot.xp * 10;
  const y = spot.yp * 7.5;
  const controlX = (gx + x) / 2;
  const controlY = Math.min(gy, y) - Math.max(70, Math.abs(gx - x) * 0.22);
  return `M ${gx} ${gy} Q ${controlX} ${controlY} ${x} ${y}`;
}
