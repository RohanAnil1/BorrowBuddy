"use client";

import { useEffect, useState } from "react";
import { createScreenDataUrl, loadBuLogo, SCREEN_H, SCREEN_W } from "./screen-art";

/** Styled 2D stand-in for the 3D device — shows while the WebGL chunk loads
 *  and permanently when WebGL is unavailable. Server-renders visible (no JS
 *  gating): the screen art drops in client-side once the painter runs. */
export function DeviceFallback() {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    // Canvas painting is client-only; the panel server-renders empty and the
    // art drops in once the painter runs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(createScreenDataUrl());
    let alive = true;
    Promise.all([document.fonts.ready, loadBuLogo()]).then(() => {
      if (alive) setUrl(createScreenDataUrl());
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="relative mx-auto flex h-full w-full max-w-[340px] items-center justify-center">
      {/* body */}
      <div className="relative h-full max-h-full w-full rounded-[36px] border border-ink/20 bg-[linear-gradient(160deg,#c6cad1_0%,#9ba0a8_38%,#787d85_58%,#5d626b_100%)] p-[10px] shadow-none">
        {/* slot */}
        <div className="mx-auto mt-2 h-[18px] w-[62%] rounded-full bg-[#101216]">
          <div className="mx-auto mt-[7px] h-[4px] w-[86%] rounded-full bg-black" />
        </div>

        {/* screen */}
        <div
          className="relative mx-auto mt-3 overflow-hidden rounded-[14px] bg-black"
          style={{ aspectRatio: `${SCREEN_W} / ${SCREEN_H}`, width: "calc(100% - 16px)" }}
        >
          {url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt="BorrowBuddy device screen — Bennett University shield at the center of a dot-matrix globe"
              className="absolute inset-0 size-full"
              draggable={false}
              src={url}
            />
          )}
        </div>

        {/* feet */}
        <div className="mx-auto mt-2 h-[10px] w-[40%] rounded-full bg-[#6d727b]" />
      </div>
    </div>
  );
}
