"use client";

import { useEffect } from "react";

/**
 * iOS Safari zooms the page in whenever a field under 16px gets focus, and
 * the campus type scale uses 12–14px fields throughout. On iOS only, cap
 * the viewport's maximum scale: WebKit then skips the focus zoom but still
 * lets people pinch-zoom (it ignores scale limits for user gestures since
 * iOS 10). Android keeps the untouched viewport, where `maximum-scale`
 * would really block zooming.
 */
export function IosInputZoomGuard() {
  useEffect(() => {
    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (!ios) return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta || /maximum-scale/.test(meta.content)) return;
    meta.content = `${meta.content}, maximum-scale=1`;
  }, []);

  return null;
}
