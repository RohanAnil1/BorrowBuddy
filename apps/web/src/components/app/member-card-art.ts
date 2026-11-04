import { memberCode, type MemberCardProfile } from "./member-card-profile";
import { paintBorrowBuddyMark } from "@/lib/brand-art";

export async function createMemberCardArt(profile: MemberCardProfile) {
  const styles = getComputedStyle(document.documentElement);
  const family = (variable: string) => styles.getPropertyValue(variable).trim() || "sans-serif";
  const title = family("--ff-noto-cond");
  const mono = family("--ff-noto-mono");
  const body = family("--ff-gotham-med");
  await Promise.all([document.fonts.load(`100px ${title}`), document.fonts.load(`30px ${mono}`), document.fonts.load(`36px ${body}`)]);
  const ink = "#f4f1e8", accent = "#ff9f00", muted = "#9ca6b5", blue = "#003993";
  const surface = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024; canvas.height = 1440;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Card artwork unavailable");
    ctx.fillStyle = "#080b10"; ctx.fillRect(0, 0, 1024, 1440);
    ctx.fillStyle = accent; ctx.fillRect(0, 0, 16, 1440);
    ctx.fillStyle = blue; ctx.fillRect(16, 0, 1008, 250);
    return { canvas, ctx };
  };
  const text = (ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, font = mono, color = ink) => {
    ctx.fillStyle = color; ctx.font = `${size}px ${font}`; ctx.textBaseline = "alphabetic"; ctx.fillText(value, x, y);
  };
  const lines = (ctx: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, size: number, font: string, lineHeight: number, maxLines: number, color = ink) => {
    ctx.font = `${size}px ${font}`;
    const words = value.trim().toUpperCase().split(/\s+/);
    const output: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > width && line) { output.push(line); line = word; }
      else line = next;
    }
    if (line) output.push(line);
    output.slice(0, maxLines).forEach((row, index) => {
      let fitted = row;
      const clipped = index === maxLines - 1 && output.length > maxLines;
      while (fitted.length && ctx.measureText(fitted + (clipped || fitted !== row ? "…" : "")).width > width) fitted = fitted.slice(0, -1);
      text(ctx, fitted + (clipped || fitted !== row ? "…" : ""), x, y + index * lineHeight, size, font, color);
    });
  };
  const role = profile.is_admin ? "ADMIN" : "STUDENT";
  const code = memberCode(profile.id);
  const name = profile.full_name || "BorrowBuddy member";
  const { canvas: front, ctx: f } = surface();
  text(f, "BORROWBUDDY", 72, 193, 82, title);
  paintBorrowBuddyMark(f, 816, 72, 128, ink, accent);
  text(f, "[ CAMPUS LENDING CREW ]", 72, 302, 28, mono, accent);
  f.fillStyle = blue; f.fillRect(72, 350, 220, 220);
  text(f, Array.from(name.trim())[0]?.toUpperCase() || "?", 125, 513, 150, title);
  text(f, "MEMBER", 336, 423, 26, mono, muted);
  text(f, code, 336, 478, 34);
  text(f, role, 336, 536, 28, mono, accent);
  lines(f, name, 72, 704, 880, 100, title, 108, 2);
  lines(f, profile.department || "Bennett University", 72, 922, 880, 32, body, 42, 2, muted);
  if (profile.year_of_study) text(f, `YEAR ${profile.year_of_study}`, 72, 1030, 29, mono, muted);
  f.strokeStyle = "#313b4b"; f.lineWidth = 2; f.beginPath(); f.moveTo(72, 1090); f.lineTo(952, 1090); f.stroke();
  text(f, profile.verification_status === "verified" ? "[ ID VERIFIED ]" : `[ ${profile.verification_status.toUpperCase()} ]`, 72, 1164, 30, mono, accent);
  // Decorative member-code stripes are not a handover token or an access credential.
  let x = 72;
  for (const character of code) {
    const value = character.charCodeAt(0);
    for (let bit = 0; bit < 4; bit++) {
      const width = 3 + ((value >> bit) & 1) * 5;
      f.fillStyle = ink; f.fillRect(x, 1220, width, 76); x += width + 5;
    }
  }
  text(f, "CAMPUS USE · LEND / BORROW / RETURN", 72, 1362, 23, mono, muted);

  const { canvas: back, ctx: b } = surface();
  text(b, "BORROWBUDDY", 72, 193, 82, title);
  paintBorrowBuddyMark(b, 816, 72, 128, ink, accent);
  text(b, `[ ${role} MEMBERSHIP ]`, 72, 310, 29, mono, accent);
  lines(b, "GOOD THINGS GO AROUND.", 72, 450, 880, 100, title, 108, 2);
  text(b, "TRUST SCORE", 72, 714, 27, mono, muted);
  text(b, `${Math.round(profile.trust_score)}`, 72, 819, 100, title, accent);
  const joined = new Date(profile.created_at);
  text(b, "MEMBER SINCE", 480, 714, 27, mono, muted);
  text(b, Number.isNaN(joined.getTime()) ? "—" : joined.getUTCFullYear().toString(), 480, 819, 100, title);
  lines(b, "Handovers happen at campus pickup spots. Agree on one in chat before you meet.", 72, 950, 880, 36, body, 52, 4, muted);
  text(b, "BORROWBUDDY MEMBERSHIP", 72, 1240, 27, mono, accent);
  text(b, code, 72, 1300, 34);
  text(b, "BENNETT UNIVERSITY · CAMPUS LENDING", 72, 1362, 23, mono, muted);

  const strap = document.createElement("canvas"); strap.width = 1024; strap.height = 160;
  const s = strap.getContext("2d");
  if (!s) throw new Error("Lanyard artwork unavailable");
  s.fillStyle = accent; s.fillRect(0, 0, 1024, 160);
  s.fillStyle = "#080b10"; s.fillRect(0, 12, 1024, 5); s.fillRect(0, 143, 1024, 5);
  text(s, "BORROWBUDDY  /  CAMPUS CREW  /", 28, 102, 44, mono, "#080b10");
  paintBorrowBuddyMark(s, 868, 32, 96, "#080b10", "#080b10");
  return { front: front.toDataURL("image/png"), back: back.toDataURL("image/png"), strap: strap.toDataURL("image/png") };
}
