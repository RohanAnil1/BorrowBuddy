"use client";

/**
 * Last-resort boundary: replaces the root layout, so it can't rely on global
 * CSS or fonts. Self-contained styles in the Campus Cargo palette.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#003993",
          color: "#ffffff",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          padding: "24px",
        }}
      >
        <title>Something went wrong · BorrowBuddy</title>
        <main
          style={{
            maxWidth: 440,
            width: "100%",
            background: "#000",
            border: "1px solid #1e1e1e",
            padding: "32px 28px",
            textAlign: "center",
          }}
        >
          <p style={{ color: "#cb840e", fontSize: 12, letterSpacing: "0.12em", margin: 0 }}>[ SYSTEM JAM ]</p>
          <h1 style={{ fontSize: 28, margin: "12px 0 8px", textTransform: "uppercase" }}>BorrowBuddy hit a snag</h1>
          <p style={{ color: "rgba(255,255,255,0.75)", lineHeight: 1.6, fontSize: 14, margin: "0 0 24px" }}>
            Your loans and account are safe. Reload to get back on track.
          </p>
          <button
            onClick={() => retry()}
            style={{
              background: "#cb840e",
              color: "#fff",
              border: 0,
              borderRadius: 8,
              padding: "12px 22px",
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
            type="button"
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 24 }}>REF {error.digest}</p>
          )}
        </main>
      </body>
    </html>
  );
}
