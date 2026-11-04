import { BORROWBUDDY_BRAND } from "@borrowbuddy/shared";

/** The approved mark, painted without changing the surrounding card artwork. */
export function paintBorrowBuddyMark(
  context: CanvasRenderingContext2D, x: number, y: number, size: number,
  left: string = BORROWBUDDY_BRAND.palette.paper,
  right: string = BORROWBUDDY_BRAND.palette.amber,
) {
  context.save();
  context.translate(x, y); context.scale(size / 256, size / 256);
  context.fillStyle = left; context.fill(new Path2D(BORROWBUDDY_BRAND.paths.left));
  context.fillStyle = right; context.fill(new Path2D(BORROWBUDDY_BRAND.paths.right));
  context.restore();
}
