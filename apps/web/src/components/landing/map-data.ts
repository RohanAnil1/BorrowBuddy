/* ---------------------------------------------------------------------------
   Bennett University master plan — traced geometry for the landing pickup
   board. Coordinates live in board units (viewBox 1400 × 980), north-up,
   matching the printed campus plan: approach road + Gates 1/2 east, Gate 3
   west, sports belts north-west, academic core centre-west, German Hangar
   and the hostel cluster centre-east, fields south.
   --------------------------------------------------------------------------- */

export const BOARD = { w: 1400, h: 980 } as const;

/* --------------------------------------------------------------- zones */

export type ZoneId =
  | "academic"
  | "admin"
  | "faculty"
  | "hostel"
  | "food"
  | "service"
  | "sports"
  | "green";

export const ZONES: Record<ZoneId, { label: string; stroke: string; fill: string }> = {
  academic: { label: "ACADEMIC", stroke: "#d9c9a8", fill: "rgba(217,201,168,0.10)" },
  admin: { label: "ADMIN", stroke: "#cb840e", fill: "rgba(203,132,14,0.12)" },
  faculty: { label: "FACULTY", stroke: "#9aa6e8", fill: "rgba(154,166,232,0.10)" },
  hostel: { label: "HOSTEL", stroke: "#7f92dd", fill: "rgba(127,146,221,0.10)" },
  food: { label: "FOOD", stroke: "#ff9f00", fill: "rgba(255,159,0,0.12)" },
  service: { label: "SERVICE", stroke: "#8b9099", fill: "rgba(139,144,153,0.08)" },
  sports: { label: "SPORTS", stroke: "#47d18a", fill: "rgba(71,209,138,0.08)" },
  green: { label: "GREEN SPACE", stroke: "#3f7d54", fill: "rgba(63,125,84,0.10)" },
};

/* ------------------------------------------------------------ roads */

export type Road = {
  id: string;
  /** thick stroked centre path */
  d: string;
  width: number;
  /** dashed centre line for two-lane carriageways */
  centerline?: string;
};

export const ROADS: Road[] = [
  { id: "gate3", d: "M 126 138 V 872", width: 52, centerline: "M 126 138 V 872" },
  { id: "north", d: "M 126 124 H 1200", width: 40 },
  { id: "loop", d: "M 126 536 H 1200", width: 44, centerline: "M 126 536 H 1200" },
  { id: "approach", d: "M 1200 124 V 872", width: 54, centerline: "M 1200 124 V 872" },
];

export const ROUNDABOUT = { x: 560, y: 536, r: 20 };

export type Gate = { id: string; x: number; y: number; label: string; side: "east" | "west" };

export const GATES: Gate[] = [
  { id: "gate-1", label: "GATE 1", x: 1200, y: 438, side: "east" },
  { id: "gate-2", label: "GATE 2", x: 1200, y: 672, side: "east" },
  { id: "gate-3", label: "GATE 3", x: 126, y: 453, side: "west" },
];

/* ----------------------------------------------------------- fields */

export type Field =
  | { id: string; kind: "pitch"; x: number; y: number; w: number; h: number; label: string }
  | { id: string; kind: "court"; x: number; y: number; w: number; h: number; label?: string }
  | { id: string; kind: "complex"; x: number; y: number; w: number; h: number; label: string };

export const FIELDS: Field[] = [
  { id: "football-n", kind: "pitch", x: 330, y: 176, w: 190, h: 72, label: "FOOTBALL GROUND" },
  { id: "football-s", kind: "pitch", x: 168, y: 578, w: 559, h: 273, label: "FOOTBALL GROUND" },
  { id: "field-se", kind: "pitch", x: 807, y: 539, w: 342, h: 312, label: "FIELD" },
  { id: "courts-top", kind: "court", x: 273, y: 128, w: 155, h: 40, label: "TENNIS" },
  { id: "courts-top-2", kind: "court", x: 432, y: 128, w: 88, h: 40 },
  { id: "courts-top-3", kind: "court", x: 524, y: 128, w: 103, h: 40 },
  { id: "indoor", kind: "complex", x: 276, y: 176, w: 52, h: 50, label: "INDOOR" },
  { id: "girls-gym", kind: "court", x: 158, y: 231, w: 52, h: 22 },
  { id: "court-1", kind: "court", x: 158, y: 176, w: 116, h: 48 },
  { id: "court-2", kind: "court", x: 158, y: 244, w: 116, h: 52 },
  { id: "court-3", kind: "court", x: 158, y: 306, w: 116, h: 52 },
  { id: "court-4", kind: "court", x: 158, y: 368, w: 116, h: 62 },
  { id: "court-5", kind: "court", x: 158, y: 440, w: 116, h: 44 },
  { id: "court-6", kind: "court", x: 158, y: 492, w: 116, h: 44 },
];

/* -------------------------------------------------------- buildings */

export type Building = {
  id: string;
  zone: ZoneId;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  /** label renders on desktop only (tiny tag) */
  minor?: boolean;
};

export const BUILDINGS: Building[] = [
  // academic core — west
  { id: "B", zone: "admin", x: 294, y: 328, w: 74, h: 125, label: "BLOCK B" },
  { id: "E", zone: "food", x: 351, y: 305, w: 102, h: 70, label: "CAFE BLOCK E" },
  { id: "D5", zone: "faculty", x: 510, y: 252, w: 69, h: 54, label: "D5", minor: true },
  { id: "D4", zone: "faculty", x: 579, y: 266, w: 57, h: 47, label: "D4", minor: true },
  { id: "D3", zone: "faculty", x: 602, y: 313, w: 57, h: 47, label: "D3", minor: true },
  { id: "D2", zone: "faculty", x: 636, y: 282, w: 68, h: 46, label: "D2", minor: true },
  { id: "D1", zone: "faculty", x: 556, y: 355, w: 46, h: 39, label: "D1", minor: true },
  { id: "C11", zone: "academic", x: 282, y: 453, w: 56, h: 34, label: "C11", minor: true },
  { id: "C10", zone: "academic", x: 282, y: 491, w: 56, h: 30, label: "C10", minor: true },
  { id: "C9", zone: "academic", x: 342, y: 491, w: 44, h: 30, label: "C9", minor: true },
  { id: "C8", zone: "academic", x: 390, y: 491, w: 40, h: 30, label: "C8", minor: true },
  { id: "C6", zone: "academic", x: 434, y: 491, w: 36, h: 30, label: "C6", minor: true },
  { id: "C7", zone: "academic", x: 434, y: 453, w: 36, h: 30, label: "C7", minor: true },
  { id: "C5", zone: "academic", x: 474, y: 491, w: 36, h: 30, label: "C5", minor: true },
  { id: "C4", zone: "academic", x: 514, y: 491, w: 36, h: 30, label: "C4", minor: true },
  { id: "C3", zone: "academic", x: 554, y: 453, w: 40, h: 66, label: "C3", minor: true },
  { id: "C1", zone: "academic", x: 598, y: 453, w: 44, h: 30, label: "C1", minor: true },
  { id: "C2", zone: "academic", x: 646, y: 453, w: 40, h: 30, label: "C2", minor: true },
  { id: "F", zone: "admin", x: 499, y: 383, w: 80, h: 132, label: "BLOCK F" },
  { id: "G", zone: "admin", x: 590, y: 383, w: 91, h: 132, label: "BLOCK G" },
  { id: "A", zone: "academic", x: 864, y: 266, w: 246, h: 141, label: "BLOCK A" },
  // service + hangar
  { id: "service", zone: "service", x: 499, y: 167, w: 57, h: 83, label: "SERVICE", minor: true },
  { id: "laundry", zone: "service", x: 613, y: 232, w: 44, h: 22, label: "LAUNDRY", minor: true },
  { id: "hangar", zone: "service", x: 921, y: 360, w: 262, h: 54, label: "GERMAN HANGAR" },
  // hostel cluster — east
  { id: "M", zone: "hostel", x: 750, y: 282, w: 102, h: 39, label: "BLOCK M" },
  { id: "N", zone: "hostel", x: 852, y: 328, w: 86, h: 39, label: "BLOCK N", minor: true },
  { id: "O", zone: "hostel", x: 932, y: 328, w: 114, h: 133, label: "BLOCK O" },
  { id: "K", zone: "hostel", x: 681, y: 399, w: 80, h: 85, label: "BLOCK K", minor: true },
  { id: "L", zone: "hostel", x: 761, y: 500, w: 91, h: 55, label: "BLOCK L", minor: true },
  { id: "P", zone: "hostel", x: 887, y: 445, w: 68, h: 63, label: "P", minor: true },
  { id: "Q", zone: "hostel", x: 966, y: 445, w: 80, h: 63, label: "Q", minor: true },
  { id: "R", zone: "hostel", x: 1035, y: 445, w: 68, h: 63, label: "R", minor: true },
  { id: "staff", zone: "hostel", x: 755, y: 345, w: 66, h: 20, minor: true },
  { id: "porta", zone: "service", x: 795, y: 300, w: 40, h: 20, minor: true },
  // food + wellness
  { id: "foodstreet", zone: "food", x: 761, y: 640, w: 126, h: 86, label: "FOOD STREET" },
  { id: "tuck", zone: "food", x: 705, y: 588, w: 30, h: 24, minor: true },
  { id: "wellness", zone: "food", x: 940, y: 560, w: 34, h: 26, minor: true },
];

/* -------------------------------------------------------------- pins */

export type MapSpot = {
  id: string;
  name: string;
  description: string;
  /** board coordinates (traced from the master plan) */
  x: number;
  y: number;
  /** decorative live count (landing stays static) */
  live: number;
};

export const SPOTS: MapSpot[] = [
  {
    id: "library",
    name: "Library Entrance",
    description: "Main library steps, ground floor",
    x: 372,
    y: 322,
    live: 14,
  },
  {
    id: "sac",
    name: "Student Activity Center",
    description: "Plaza beside the German Hangar",
    x: 706,
    y: 434,
    live: 9,
  },
  {
    id: "block-a",
    name: "Academic Block A",
    description: "Atrium near the notice board",
    x: 988,
    y: 300,
    live: 11,
  },
  {
    id: "boys-hostel",
    name: "Boys Hostel Gate",
    description: "Gate 1 entrance, north side of Block O",
    x: 1124,
    y: 346,
    live: 21,
  },
  {
    id: "girls-hostel",
    name: "Girls Hostel Gate",
    description: "Gate 2 entrance, Block R side",
    x: 1075,
    y: 530,
    live: 7,
  },
  {
    id: "sports",
    name: "Sports Complex",
    description: "Near the equipment room",
    x: 352,
    y: 198,
    live: 6,
  },
  {
    id: "cafeteria",
    name: "Cafeteria",
    description: "Central seating, Food Street",
    x: 808,
    y: 690,
    live: 12,
  },
];

/** Route trace from Gate 1 to a pickup pin — arrival path for visitors. */
export function routePath(x: number, y: number): string {
  const gateX = 1200;
  const gateY = 438;
  const controlX = (gateX + x) / 2;
  const controlY = Math.min(gateY, y) - Math.max(70, Math.abs(gateX - x) * 0.22);
  return `M ${gateX} ${gateY} Q ${controlX} ${controlY} ${x} ${y}`;
}
