import { ImageResponse } from "next/og";

export const alt = "BorrowBuddy: borrow and lend on campus at Bennett University";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The share card for links to the site (WhatsApp, Instagram, X, Google). */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #021249 0%, #003993 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 16,
              background: "#000000",
              border: "3px solid #cb840e",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 34,
              fontWeight: 800,
              color: "#cb840e",
            }}
          >
            BB
          </div>
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: 4 }}>BORROWBUDDY</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, maxWidth: 980 }}>
            Borrow it. Lend it. Right here on campus.
          </div>
          <div style={{ fontSize: 32, color: "#d6dcf0", maxWidth: 960 }}>
            Cameras, projectors, books and sports gear from verified Bennett University students.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div
            style={{
              display: "flex",
              background: "#cb840e",
              color: "#ffffff",
              fontSize: 28,
              fontWeight: 700,
              padding: "14px 28px",
              borderRadius: 12,
            }}
          >
            borrowbuddy.online
          </div>
          <div style={{ fontSize: 24, color: "#9fb4e6", letterSpacing: 3 }}>VERIFIED STUDENTS · QR HANDOVERS</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
