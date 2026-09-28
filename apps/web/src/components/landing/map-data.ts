/* ---------------------------------------------------------------------------
   Bennett University master plan — pickup points for the landing board.
   Everything is expressed as a percentage of the 4000 × 3000 photograph, so a
   pin can be nudged later with two numbers: xp runs left to right, yp top to
   bottom. Traced from the printed plan (north-up: Gates 1/2 on the east
   approach road, Gate 3 west, sports belt north-west, academic core and
   library centre, hostel cluster east, fields south).
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
  /** decorative live count (landing stays static) */
  live: number;
};

export const SPOTS: MapSpot[] = [
  {
    id: "library",
    name: "Library Entrance",
    description: "Main library steps, ground floor",
    xp: 50.1,
    yp: 40.7,
    label: "left",
    live: 14,
  },
  {
    id: "sac",
    name: "Student Activity Center",
    description: "Plaza beside the German Hangar",
    xp: 56.0,
    yp: 46.0,
    label: "right",
    live: 9,
  },
  {
    id: "block-a",
    name: "Academic Block A",
    description: "Atrium near the notice board",
    xp: 45.4,
    yp: 49.8,
    label: "right",
    live: 11,
  },
  {
    id: "boys-hostel",
    name: "Boys Hostel Gate",
    description: "Gate 1 entrance, Block O side",
    xp: 63.6,
    yp: 42.7,
    label: "left",
    live: 21,
  },
  {
    id: "girls-hostel",
    name: "Girls Hostel Gate",
    description: "Gate 2 entrance, Block P side",
    xp: 61.0,
    yp: 50.7,
    label: "left",
    live: 7,
  },
  {
    id: "sports",
    name: "Sports Complex",
    description: "Near the equipment room",
    xp: 28.1,
    yp: 29.1,
    label: "right",
    live: 6,
  },
  {
    id: "cafeteria",
    name: "Cafeteria",
    description: "Central seating, Food Street",
    xp: 41.5,
    yp: 60.0,
    label: "right",
    live: 12,
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
