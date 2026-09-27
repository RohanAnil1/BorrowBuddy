/**
 * Screen art for the 3D cargo device â€” painted onto a 512Ã—720 canvas and used
 * both as the WebGL CanvasTexture and by the no-WebGL fallback panel.
 * Palette-only colors, dot-matrix globe with a camera silhouette rising
 * through it (the reference's NZ-map-globe, tailored for BorrowBuddy).
 */

export const SCREEN_W = 512;
export const SCREEN_H = 720;

const ACCENT = "#cb840e";
const WARN = "#ff9f00";
const INK = "#ffffff";
const BG = "#030711";

/** Official Bennett University shield — loaded once, drawn by the painter.
 *  Same-origin asset in /public/brand, so the canvas stays untainted. */
let buShield: HTMLImageElement | null = null;
let buShieldPromise: Promise<void> | null = null;

export function loadBuLogo(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!buShieldPromise) {
    buShieldPromise = new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        buShield = img;
        resolve();
      };
      img.onerror = () => resolve();
      img.src = "/brand/bu-shield.png";
    });
  }
  return buShieldPromise;
}

/** Deterministic PRNG (no Math.random â€” same art every paint). */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  l: number,
  t: number,
  r: number,
  b: number,
  rad: number,
) {
  const w = r - l;
  const h = b - t;
  ctx.beginPath();
  ctx.roundRect(l, t, w, h, rad);
}

function inRoundedRect(
  l: number,
  t: number,
  r: number,
  b: number,
  rad: number,
  x: number,
  y: number,
) {
  const cx = (l + r) / 2;
  const cy = (t + b) / 2;
  const dx = Math.max(Math.abs(x - cx) - (r - l) / 2 + rad, 0);
  const dy = Math.max(Math.abs(y - cy) - (b - t) / 2 + rad, 0);
  return dx * dx + dy * dy <= rad * rad;
}

function inCamera(x: number, y: number): boolean {
  // body
  if (inRoundedRect(150, 248, 362, 352, 20, x, y)) return true;
  // top bump (viewfinder)
  if (inRoundedRect(212, 220, 300, 248, 10, x, y)) return true;
  // lens annulus + core
  const d = Math.hypot(x - 256, y - 300);
  if (d <= 44 && d >= 21) return true;
  if (d <= 9) return true;
  return false;
}

function monoFamily(): string {
  if (typeof document === "undefined") return "monospace";
  const v = getComputedStyle(document.documentElement).getPropertyValue("--ff-noto-cond");
  return v?.trim() ? `${v.trim()}, "Arial Narrow", sans-serif` : '"Arial Narrow", sans-serif';
}

/** Paint the full device screen onto a canvas. Call after fonts are ready. */
export function paintCargoScreen(canvas: HTMLCanvasElement): void {
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const rand = mulberry32(2025);

  // screen background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  // faint dot grid
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  for (let y = 28; y < SCREEN_H - 28; y += 16) {
    for (let x = 28; x < SCREEN_W - 28; x += 16) {
      ctx.fillRect(x, y, 1.5, 1.5);
    }
  }

  // ticket top strip (echoes the boarding-pass motif)
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 4;
  ctx.strokeRect(30, 36, SCREEN_W - 60, 18);
  ctx.fillStyle = ACCENT;
  ctx.fillRect(40, 42, SCREEN_W - 80, 6);

  // micro status line
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `15px ${monoFamily()}`;
  ctx.textAlign = "center";
  ctx.fillText("UNIT 0427 Â· ONLINE", SCREEN_W / 2, 92);

  // ---- particle globe (orthographic front hemisphere, rotated 24Â°) ----
  const gcx = SCREEN_W / 2;
  const gcy = 300;
  const R = 168;
  const rot = (24 * Math.PI) / 180;

  for (let lat = -84; lat <= 84; lat += 6.4) {
    const la = (lat * Math.PI) / 180;
    for (let lon = -180; lon < 180; lon += 6.6) {
      const lo = (lon * Math.PI) / 180 + rot;
      const x3 = Math.cos(la) * Math.sin(lo);
      const z3 = Math.cos(la) * Math.cos(lo);
      if (z3 < 0.02) continue;
      const y3 = Math.sin(la);
      const px = gcx + x3 * R;
      const py = gcy - y3 * R * 0.98;
      const depth = z3;
      ctx.fillStyle = depth > 0.6 ? WARN : ACCENT;
      ctx.globalAlpha = 0.16 + depth * 0.62;
      const r = 1.1 + depth * 1.1;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // ---- center emblem: the official Bennett shield once loaded; until then
  //      (and offline) the camera silhouette rises through the globe ----
  if (buShield) {
    // crop the asset to the shield's own bounds (the 500px file carries
    // transparent padding) and fit it to the globe's heart
    const src = { x: 82, y: 10, w: 362, h: 478 };
    const dh = 180;
    const dw = src.w * (dh / src.h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      buShield,
      src.x,
      src.y,
      src.w,
      src.h,
      SCREEN_W / 2 - dw / 2,
      296 - dh / 2,
      dw,
      dh,
    );
  } else {
    for (let y = 216; y <= 356; y += 5.4) {
      for (let x = 146; x <= 366; x += 5.4) {
        if (!inCamera(x + (Math.sin(x * 0.11) * 1.2), y)) continue;
        ctx.fillStyle = "#ffd27a";
        ctx.globalAlpha = 0.95;
        ctx.beginPath();
        ctx.arc(x, y, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---- titles ----
  ctx.fillStyle = INK;
  ctx.font = `bold 44px ${monoFamily()}`;
  ctx.textAlign = "center";
  ctx.fillText("BORROWBUDDY", SCREEN_W / 2, 540);

  ctx.fillStyle = WARN;
  ctx.font = `bold 19px ${monoFamily()}`;
  ctx.fillText("THE CAMPUS LENDING NETWORK", SCREEN_W / 2, 574);

  // ---- barcode ----
  const bars = [
    3, 1, 2, 1, 4, 1, 1, 2, 3, 2, 1, 1, 4, 2, 1, 3, 1, 2, 2, 1, 3, 1, 1, 4, 2, 1, 2, 3, 1, 1,
    2, 1, 4, 1, 3, 2, 1, 2, 1, 1, 2, 4, 1, 1, 3, 1, 2, 2,
  ];
  let bx = 96;
  ctx.fillStyle = INK;
  for (const w of bars) {
    ctx.globalAlpha = 0.9;
    ctx.fillRect(bx, 604, w * 2.1, 34);
    bx += w * 2.1 + 4;
  }
  ctx.globalAlpha = 1;

  // ---- corner scan brackets ----
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 3;
  const m = 16;
  const len = 30;
  const corners: [number, number, number, number][] = [
    [m, m, 1, 1],
    [SCREEN_W - m, m, -1, 1],
    [m, SCREEN_H - m, 1, -1],
    [SCREEN_W - m, SCREEN_H - m, -1, -1],
  ];
  for (const [cx2, cy2, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx2 + sx * len, cy2);
    ctx.lineTo(cx2, cy2);
    ctx.lineTo(cx2, cy2 + sy * len);
    ctx.stroke();
  }

  // ---- CTA bar ----
  ctx.fillStyle = ACCENT;
  roundedRect(ctx, 96, SCREEN_H - 76, SCREEN_W - 96, SCREEN_H - 28, 10);
  ctx.fill();
  ctx.fillStyle = "#120b02";
  ctx.fillText("BROWSE THE CATALOG", SCREEN_W / 2 - 14, SCREEN_H - 42);
// manual arrow triangle (canvas fonts lack a reliable arrow glyph)
  ctx.beginPath();
  const ay = SCREEN_H - 49;
  ctx.moveTo(SCREEN_W / 2 + 96, ay);
  ctx.lineTo(SCREEN_W / 2 + 96, ay + 14);
  ctx.lineTo(SCREEN_W / 2 + 110, ay + 7);
  ctx.closePath();
  ctx.fill();

  // scattered star dust
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  for (let i = 0; i < 26; i += 1) {
    const sx = 40 + rand() * (SCREEN_W - 80);
    const sy = 110 + rand() * 400;
    ctx.globalAlpha = 0.15 + rand() * 0.35;
    ctx.fillRect(sx, sy, 1.6, 1.6);
  }
  ctx.globalAlpha = 1;
}

/** Small engraved plate texture for the device body (BB mark). */
export function paintBBPlate(canvas: HTMLCanvasElement): void {
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = "#f0f0f0";
  ctx.fillRect(6, 6, 116, 116);
  ctx.fillStyle = "#003993";
  ctx.font = `bold 74px ${monoFamily()}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("B", 64, 56);
  ctx.fillStyle = ACCENT;
  ctx.fillRect(28, 96, 72, 12);
}

/** Soft elliptical contact shadow under the device. */
export function paintContactShadow(canvas: HTMLCanvasElement): void {
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const g = ctx.createRadialGradient(128, 64, 8, 128, 64, 120);
  g.addColorStop(0, "rgba(0,0,0,0.6)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 128);
}

/** Data URL helper for the fallback panel. */
export function createScreenDataUrl(): string {
  const canvas = document.createElement("canvas");
  paintCargoScreen(canvas);
  return canvas.toDataURL("image/png");
}

/** Procedural brushed-metal finish — horizontal streaks used as
 *  roughnessMap + bumpMap on the device body. */
export function paintBrushedMetal(canvas: HTMLCanvasElement): void {
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const rng = mulberry32(7421);

  ctx.fillStyle = "#9c9c9c";
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 1400; i += 1) {
    const y = Math.floor(rng() * 512);
    const x = Math.floor(rng() * 512);
    const w = 24 + rng() * 190;
    const shade = 150 + Math.floor(rng() * 100);
    ctx.strokeStyle = `rgba(${shade},${shade},${shade},${0.06 + rng() * 0.16})`;
    ctx.lineWidth = 0.6 + rng() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.lineTo(x + w / 2, y + (rng() - 0.5) * 1.2);
    ctx.stroke();
  }

  // fine horizontal grain
  for (let y = 0; y < 512; y += 2) {
    ctx.fillStyle = `rgba(255,255,255,${rng() * 0.05})`;
    ctx.fillRect(0, y, 512, 1);
  }
}

/** Dot-matrix speaker grille strip for the lower bezel. */
export function paintGrille(canvas: HTMLCanvasElement): void {
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, 512, 64);
  ctx.fillStyle = "rgba(255,255,255,0.32)";
  for (let y = 12; y <= 52; y += 10) {
    for (let x = 12; x <= 500; x += 10) {
      ctx.beginPath();
      ctx.arc(x, y, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * Dot-matrix silhouette bust — the "student photo" slot on paper tags.
 * Head + shoulders built from bright dots on near-black, with seeded
 * variation (head width, tilt, shoulder slope) so every borrower reads
 * as a different photo. Echoes the device screen's dot language.
 */
export function paintDotBust(canvas: HTMLCanvasElement, seed = 1): void {
  canvas.width = 320;
  canvas.height = 384;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const rng = mulberry32(seed * 7919 + 13);

  ctx.fillStyle = "#05070e";
  ctx.fillRect(0, 0, 320, 384);

  // seeded geometry
  const headW = 54 + rng() * 16; // half-width of head ellipse
  const tilt = (rng() - 0.5) * 0.16; // radians
  const neckW = 22 + rng() * 7;
  const shoulderSlope = 0.42 + rng() * 0.22;
  const shoulderLift = 150 + rng() * 22;

  const cx = 160;
  const headCy = 132;
  const inBust = (x: number, y: number): boolean => {
    // head ellipse (tilted)
    const dx = x - cx;
    const dy = y - headCy;
    const c = Math.cos(tilt);
    const s = Math.sin(tilt);
    const rx = dx * c + dy * s;
    const ry = -dx * s + dy * c;
    const head =
      (rx * rx) / (headW * headW) + (ry * ry) / (78 * 78) <= 1 && y < headCy + 70;
    // neck
    const neck =
      Math.abs(x - cx) < neckW && y >= headCy + 62 && y < shoulderLift + 8;
    // shoulders — smooth bell curve
    const t = Math.max(0, (y - shoulderLift) / (384 - shoulderLift));
    const halfW = 30 + t * 118;
    const liftOk = y >= shoulderLift && y <= 384;
    const shoulders =
      liftOk && Math.abs(x - cx) < halfW * (1 - Math.pow(t, shoulderSlope) * 0.25);
    return head || neck || shoulders;
  };

  ctx.fillStyle = "#0b1030";
  ctx.fillRect(0, 0, 320, 384);

  // dot the bust
  for (let y = 40; y < 384; y += 4.6) {
    for (let x = 20; x < 300; x += 4.6) {
      if (!inBust(x, y)) continue;
      const edge = Math.min(1, 0.35 + rng() * 0.75);
      ctx.fillStyle = edge > 0.72 ? "#ffd27a" : "#cb840e";
      ctx.globalAlpha = 0.5 + rng() * 0.5;
      ctx.beginPath();
      ctx.arc(x + (rng() - 0.5), y + (rng() - 0.5), 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // face hint — two darker eye notches for character
  ctx.fillStyle = "#05070e";
  ctx.beginPath();
  ctx.arc(cx - headW * 0.42, headCy - 6, 5.2, 0, Math.PI * 2);
  ctx.arc(cx + headW * 0.42, headCy - 6, 5.2, 0, Math.PI * 2);
  ctx.fill();

  // scan frame corners
  ctx.strokeStyle = "rgba(240,240,240,0.85)";
  ctx.lineWidth = 3;
  const m = 12;
  const len = 22;
  const corners: [number, number, number, number][] = [
    [m, m, 1, 1],
    [320 - m, m, -1, 1],
    [m, 384 - m, 1, -1],
    [320 - m, 384 - m, -1, -1],
  ];
  for (const [cx2, cy2, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx2 + sx * len, cy2);
    ctx.lineTo(cx2, cy2);
    ctx.lineTo(cx2, cy2 + sy * len);
    ctx.stroke();
  }
}
