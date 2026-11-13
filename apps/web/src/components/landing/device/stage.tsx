"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { DeviceFallback } from "./device-fallback";

const CargoDeviceCanvas = dynamic(() => import("./cargo-device-canvas"), {
  ssr: false,
  loading: () => <DeviceFallback />,
});

type Gpu = "checking" | "webgl" | "fallback";

function detectWebGL(): Gpu {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2", { antialias: true }) ??
      canvas.getContext("webgl", { antialias: true });
    return gl ? "webgl" : "fallback";
  } catch {
    return "fallback";
  }
}

/** The hero device stage: WebGL canvas with a styled 2D stand-in during load
 *  and as a permanent fallback when no WebGL context exists. A one-shot CSS
 *  scanline sweeps over it as part of the opening boot sequence. */
export function DeviceStage() {
  const [gpu, setGpu] = useState<Gpu>("checking");

  useEffect(() => {
    // WebGL support is only knowable client-side. The probe (and with it the
    // three.js chunk download + scene compile) waits for an idle moment, so
    // the landing page hydrates and answers taps first; the 2D stand-in
    // holds the slot meanwhile, exactly as it does while the chunk loads.
    const probe = () => setGpu(detectWebGL());
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(probe, { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = setTimeout(probe, 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative size-full" data-device-stage>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[-6%] z-0"
        style={{
          background:
            "radial-gradient(58% 52% at 50% 46%, rgba(203,132,14,0.2), transparent 72%)",
        }}
      />

      <div className="relative z-[1] size-full">
        {gpu === "webgl" ? <CargoDeviceCanvas /> : <DeviceFallback />}
      </div>

      {/* boot scanline — one sweep, fires after the preloader hands over */}
      <div aria-hidden className="scanline-sweep pointer-events-none absolute inset-0 z-[2]" />

      <p className="status-bracket absolute -bottom-2 left-1/2 z-[3] -translate-x-1/2 text-[9px] opacity-60">
        [ DRAG TO INSPECT ]
      </p>
    </div>
  );
}
