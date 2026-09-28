/* ---------------------------------------------------------------------------
   The Lending Line — canvas painters. Every texture in the scene is drawn
   here: the parcel faces, station signage, hazard tape, conveyor slats,
   lens, curtains and glow sprites. Fonts are resolved from the live CSS
   variables after document.fonts.ready (same pattern as screen-art.ts).
   --------------------------------------------------------------------------- */

import QRCode from "qrcode";
import type { CrateDef } from "./timeline";
import { GATES } from "./timeline";

const PAPER = "#f0f0f0";
const BLACK = "#000000";
const ACCENT = "#cb840e";
const ACCENT_HI = "#ffb24d";
const OK = "#47d18a";
const DEEP = "#003993";

function family(varName: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName);
  return value?.trim() ? `${value.trim()}, ${fallback}` : fallback;
}

export const condFamily = () => family("--ff-noto-cond", '"Arial Narrow", sans-serif');
export const monoFamily = () => family("--ff-noto-mono", "monospace");

function barWidths(seed: number, count: number): number[] {
  let state = (seed * 2654435761) % 4294967296 || 1;
  return Array.from({ length: count }, () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return 3 + (state % 6);
  });
}

/** Manual chunky arrow (canvas condensed fonts lack a reliable glyph). */
function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y - h / 6, w - h / 2, h / 3);
  ctx.beginPath();
  ctx.moveTo(x + w - h, y - h / 2);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w - h, y + h / 2);
  ctx.closePath();
  ctx.fill();
}

/* ------------------------------------------------------------------ parcel */

const STAMP_POS = [
  { x: 4, y: 48, rotate: -9 },
  { x: 30, y: 52, rotate: -5 },
  { x: 6, y: 62, rotate: -11 },
  { x: 26, y: 70, rotate: -7 },
];

export function paintParcelFront(canvas: HTMLCanvasElement, crate: CrateDef, stamps: number): Promise<void> {
  canvas.width = 512;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve();
  const W = canvas.width;
  const H = canvas.height;

  // paper
  const paper = ctx.createLinearGradient(0, 0, 0, H);
  paper.addColorStop(0, "#ffffff");
  paper.addColorStop(0.58, PAPER);
  paper.addColorStop(1, "#e7e7e7");
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);

  // grain
  ctx.fillStyle = "rgba(0,0,0,0.02)";
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);

  // brand band
  ctx.fillStyle = BLACK;
  ctx.fillRect(0, 0, W, 150);
  ctx.fillStyle = PAPER;
  ctx.font = `700 44px ${condFamily()}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText("BB", 30, 58);
  ctx.fillText("BU", 30, 106);
  // QR ring mark
  ctx.strokeStyle = "rgba(240,240,240,0.9)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(112, 75, 30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(240,240,240,0.9)";
  ctx.fillRect(104, 67, 7, 7);
  ctx.fillRect(115, 67, 7, 7);
  ctx.fillRect(104, 78, 7, 7);
  ctx.fillRect(115, 78, 4, 4);
  // wordmark
  ctx.font = `700 34px ${condFamily()}`;
  ctx.textAlign = "right";
  ctx.fillText("BORROWBUDDY", W - 30, 75);
  // cargo mark
  ctx.fillStyle = PAPER;
  ctx.fillRect(W - 118, 102, 26, 26);
  ctx.fillStyle = DEEP;
  ctx.fillRect(W - 118 + 5, 102 + 5, 16, 16);
  ctx.fillStyle = ACCENT;
  ctx.fillRect(W - 118 + 5, 102 + 13, 16, 4);

  // item name — condensed, max two lines
  ctx.fillStyle = BLACK;
  ctx.textAlign = "left";
  ctx.font = `700 58px ${condFamily()}`;
  const words = crate.name.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > W - 200 && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  lines.slice(0, 2).forEach((text, i) => ctx.fillText(text, 30, 210 + i * 62));

  // route — giant codes with arrow
  ctx.font = `700 120px ${condFamily()}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(crate.from, 30, 512);
  ctx.textAlign = "right";
  ctx.fillText(crate.to, W - 30, 512);
  drawArrow(ctx, W / 2 - 70, 470, 140, 34, BLACK);

  // barcode
  ctx.textBaseline = "middle";
  const bars = barWidths(crate.seed, 46);
  let bx = 30;
  ctx.fillStyle = BLACK;
  for (const width of bars) {
    ctx.fillRect(bx, 546, width, 62);
    bx += width + 5;
    if (bx > W - 30) break;
  }
  ctx.font = `700 24px ${monoFamily()}`;
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillText(crate.serial, W / 2, 634);

  // status strip
  ctx.fillStyle = BLACK;
  ctx.fillRect(0, H - 76, W, 76);
  ctx.fillStyle = ACCENT_HI;
  ctx.font = `700 30px ${monoFamily()}`;
  ctx.textAlign = "center";
  const status = stamps === 0 ? "[ IN TRANSIT ]" : `[ ${GATES[stamps - 1].label} ]`;
  ctx.fillText(status, W / 2, H - 37);

  // postmarks
  STAMP_POS.forEach((pos, index) => {
    if (stamps <= index) return;
    const x = (pos.x / 100) * W;
    const y = (pos.y / 100) * H;
    ctx.save();
    ctx.translate(x + 60, y + 26);
    ctx.rotate((pos.rotate * Math.PI) / 180);
    ctx.font = `700 30px ${monoFamily()}`;
    const label = GATES[index].label;
    const width = ctx.measureText(label).width + 26;
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = index === 2 ? ACCENT : "rgba(0,0,0,0.7)";
    ctx.lineWidth = 3;
    ctx.strokeRect(-width / 2, -26, width, 46);
    ctx.fillStyle = index === 2 ? ACCENT : "rgba(0,0,0,0.7)";
    ctx.textAlign = "center";
    ctx.fillText(label, 0, -1);
    ctx.restore();
  });

  // QR block — the parcel's own scan tag (real QR of the serial)
  return QRCode.toCanvas(document.createElement("canvas"), crate.serial, {
    color: { dark: BLACK, light: "#ffffff" },
    margin: 1,
    width: 240,
  })
    .then((qr) => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(W - 30 - 132, 168, 132, 132);
      ctx.drawImage(qr as unknown as HTMLCanvasElement, W - 30 - 124, 176, 116, 116);
    })
    .catch(() => undefined);
}

export function paintParcelBack(canvas: HTMLCanvasElement, crate: CrateDef): void {
  canvas.width = 512;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;

  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, W, canvas.height);
  ctx.strokeStyle = "#1e1e1e";
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, W - 20, canvas.height - 20);

  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(W / 2, 258, 82, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(203,132,14,0.9)";
  ctx.fillRect(W / 2 - 26, 246, 14, 14);
  ctx.fillRect(W / 2 + 12, 246, 14, 14);
  ctx.fillRect(W / 2 - 26, 262, 8, 8);
  ctx.fillRect(W / 2 + 16, 262, 10, 10);

  ctx.textAlign = "center";
  ctx.font = `700 30px ${monoFamily()}`;
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillText("CUSTODY CHAIN", W / 2, 420);
  ctx.font = `700 64px ${condFamily()}`;
  ctx.fillStyle = ACCENT;
  ctx.fillText("2/2 SCANS", W / 2, 508);
  ctx.font = `700 26px ${monoFamily()}`;
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillText(crate.serial, W / 2, 576);
}

/* ------------------------------------------------------------- station art */

export function paintIdPlate(canvas: HTMLCanvasElement, code: string, phase: string): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;

  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(240,240,240,0.35)";
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, W - 8, H - 8);

  ctx.textAlign = "center";
  ctx.font = `700 30px ${monoFamily()}`;
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.fillText(code, W / 2, 54);

  // status dot
  const dot = phase === "after" || phase === "still" ? OK : ACCENT_HI;
  const bright = phase === "wake" || phase === "scan";
  ctx.beginPath();
  ctx.arc(W / 2, 122, 26, 0, Math.PI * 2);
  ctx.fillStyle = bright ? dot : "rgba(203,132,14,0.35)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(W / 2, 122, 15, 0, Math.PI * 2);
  ctx.fillStyle = dot;
  ctx.fill();

  ctx.font = `700 26px ${monoFamily()}`;
  ctx.fillStyle = phase === "after" || phase === "still" ? OK : ACCENT_HI;
  const label = phase === "wake" ? "SYNC" : phase === "scan" ? "SCAN" : phase === "after" || phase === "still" ? "OK" : "···";
  ctx.fillText(label, W / 2, 206);
}

export function paintSign(canvas: HTMLCanvasElement, code: string, label: string, phase: string): void {
  canvas.width = 1120;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#f4f2ee";
  ctx.fillRect(0, 0, 1120, 256);
  ctx.strokeStyle = "rgba(0,0,0,0.78)";
  ctx.lineWidth = 12;
  ctx.strokeRect(10, 10, 1100, 236);

  // hero gate name — tints with the life-cycle
  const tint = phase === "wake" || phase === "scan" ? ACCENT : phase === "after" ? OK : "#111111";
  ctx.fillStyle = tint;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = `700 122px ${condFamily()}`;
  ctx.fillText(label, 48, 140);

  // code + arrow, right-aligned
  ctx.fillStyle = BLACK;
  ctx.textAlign = "right";
  ctx.font = `700 62px ${monoFamily()}`;
  ctx.fillText(code, 1064 - 92, 140);
  drawArrow(ctx, 1064 - 78, 138, 62, 30, BLACK);
}

export function paintHazard(canvas: HTMLCanvasElement): void {
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#0b0b0b";
  ctx.fillRect(0, 0, 128, 128);
  ctx.save();
  ctx.translate(64, 64);
  ctx.rotate(-Math.PI / 4);
  for (let i = -4; i <= 4; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? "rgba(203,132,14,0.9)" : "rgba(0,0,0,0.85)";
    ctx.fillRect(i * 32 - 16, -140, 32, 280);
  }
  ctx.restore();
}

export function paintSlats(canvas: HTMLCanvasElement): void {
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#17130e";
  ctx.fillRect(0, 0, 256, 64);
  for (let x = 0; x < 256; x += 64) {
    ctx.fillStyle = "#060504";
    ctx.fillRect(x, 0, 7, 64);
    ctx.fillStyle = "rgba(240,240,240,0.05)";
    ctx.fillRect(x + 7, 0, 2, 64);
  }
  const sheen = ctx.createLinearGradient(0, 0, 0, 64);
  sheen.addColorStop(0, "rgba(255,190,120,0.10)");
  sheen.addColorStop(0.5, "rgba(0,0,0,0)");
  sheen.addColorStop(1, "rgba(0,0,0,0.4)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, 256, 64);
}

export function paintLens(canvas: HTMLCanvasElement): void {
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const radial = ctx.createRadialGradient(128, 128, 4, 128, 128, 124);
  radial.addColorStop(0, "#fff6e6");
  radial.addColorStop(0.35, ACCENT_HI);
  radial.addColorStop(0.72, ACCENT);
  radial.addColorStop(1, "rgba(203,132,14,0)");
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(128, 128, 96, 0, Math.PI * 2);
  ctx.stroke();
}

export function paintRadialGlow(canvas: HTMLCanvasElement): void {
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const radial = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  radial.addColorStop(0, "rgba(255,255,255,0.9)");
  radial.addColorStop(0.45, "rgba(255,255,255,0.28)");
  radial.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, 256, 256);
}

export function paintCone(canvas: HTMLCanvasElement): void {
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const linear = ctx.createLinearGradient(0, 0, 0, 256);
  linear.addColorStop(0, "rgba(255,255,255,0.85)");
  linear.addColorStop(0.35, "rgba(255,255,255,0.35)");
  linear.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = linear;
  ctx.fillRect(0, 0, 64, 256);
}

export function paintCurtain(canvas: HTMLCanvasElement): void {
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const linear = ctx.createLinearGradient(0, 0, 0, 256);
  linear.addColorStop(0, "rgba(255,206,140,0.42)");
  linear.addColorStop(0.28, "rgba(56,44,28,0.5)");
  linear.addColorStop(1, "rgba(12,10,8,0.35)");
  ctx.fillStyle = linear;
  ctx.fillRect(0, 0, 64, 256);
  ctx.fillStyle = "rgba(255,220,170,0.35)";
  ctx.fillRect(0, 0, 64, 6);
}

export function paintTrustChip(canvas: HTMLCanvasElement): void {
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "rgba(5,5,5,0.92)";
  ctx.fillRect(0, 0, 256, 96);
  ctx.strokeStyle = ACCENT_HI;
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, 248, 88);
  ctx.fillStyle = ACCENT_HI;
  ctx.font = `700 40px ${monoFamily()}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("+8 TRUST", 128, 52);
}
