"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrCodeTile({
  payload,
  label,
  size = 208,
}: {
  payload: string;
  label: string;
  size?: number;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 2,
      scale: 8,
    }).then((url) => {
      if (!cancelled) setDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  return (
    <div
      className="relative bg-white p-3"
      style={{ width: size + 24, maxWidth: "100%" }}
    >
      {/* pulsing border ring */}
      <span
        aria-hidden
        className="absolute -inset-1.5 animate-[pulse-soft_2.2s_ease-in-out_infinite] border-2 border-accent motion-reduce:animate-none"
      />
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={label}
          className="block aspect-square h-auto w-full"
          height={size}
          src={dataUrl}
          width={size}
        />
      ) : (
        <span className="flex aspect-square w-full items-center justify-center bg-black font-secondary text-[9px] text-ink/40">
          RENDERING…
        </span>
      )}
    </div>
  );
}
