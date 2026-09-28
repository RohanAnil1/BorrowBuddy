/* ---------------------------------------------------------------------------
   The Lending Line — shared timeline. The same segment math feeds the WebGL
   scene (continuous motion) and the DOM log row (discrete phase events).
   --------------------------------------------------------------------------- */

export type GateDef = { code: string; label: string; caption: string };

export const GATES: GateDef[] = [
  { code: "G-01", label: "REQUESTED", caption: "OWNER APPROVES" },
  { code: "G-02", label: "ACCEPTED", caption: "DATES LOCKED IN" },
  { code: "G-03", label: "HANDED OVER", caption: "QR SCAN · CUSTODY 2/2" },
  { code: "G-04", label: "RETURNED", caption: "BACK ON THE SHELF" },
];

/** Gate centres as fractions of the line span. */
export const GATE_X = [0.125, 0.375, 0.625, 0.875];

export type CrateDef = {
  id: string;
  name: string;
  from: string;
  to: string;
  serial: string;
  seed: number;
};

export const CRATES: CrateDef[] = [
  { id: "sony", name: "SONY A7 III", from: "BLC", to: "LIB", serial: "8998040139", seed: 3 },
  { id: "epson", name: "EPSON PROJECTOR", from: "SAC", to: "HSA", serial: "0101045216", seed: 7 },
  { id: "jbl", name: "JBL SPEAKER", from: "LIB", to: "CAF", serial: "2436315621", seed: 11 },
];

export const START_X = -0.16;
export const END_X = 1.16;
const LEAD_IN = 1100;
const DWELL = 640;
const TRAVEL = 1900;
const EXIT = 1250;

export type Segment = {
  kind: "travel" | "dwell";
  from: number;
  to: number;
  gate: number | null;
  dur: number;
};

export const SEGMENTS: Segment[] = (() => {
  const list: Segment[] = [{ kind: "travel", from: START_X, to: GATE_X[0], gate: null, dur: LEAD_IN }];
  for (let i = 0; i < GATES.length; i += 1) {
    list.push({ kind: "dwell", from: GATE_X[i], to: GATE_X[i], gate: i, dur: DWELL });
    if (i < GATES.length - 1) {
      list.push({ kind: "travel", from: GATE_X[i], to: GATE_X[i + 1], gate: null, dur: TRAVEL });
    }
  }
  list.push({ kind: "travel", from: GATE_X[GATES.length - 1], to: END_X, gate: null, dur: EXIT });
  return list;
})();

export const CYCLE_MS = SEGMENTS.reduce((sum, segment) => sum + segment.dur, 0);

/** Custody changes hands between gates 2 and 3 — and turns back to front on the run to gate 4. */
export const FLIP_OUT = SEGMENTS.findIndex((s) => s.kind === "travel" && s.from === GATE_X[1]);
export const FLIP_BACK = SEGMENTS.findIndex((s) => s.kind === "travel" && s.from === GATE_X[2]);

export function locate(et: number) {
  let acc = 0;
  for (let i = 0; i < SEGMENTS.length; i += 1) {
    const segment = SEGMENTS[i];
    if (et < acc + segment.dur) return { index: i, local: (et - acc) / segment.dur };
    acc += segment.dur;
  }
  return { index: SEGMENTS.length - 1, local: 1 };
}

export const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
export const clamp01 = (p: number) => Math.min(1, Math.max(0, p));

export type GatePhase = "idle" | "wake" | "scan" | "after" | "still";

export type LineSync = {
  activeGate: number | null;
  wakingGate: number | null;
  lastActive: number | null;
  stamps: number;
  crateIndex: number;
  count: number;
};

/** Fraction of the span → world x. */
export const toWorldX = (fraction: number, span: number) => (fraction - 0.5) * span;
