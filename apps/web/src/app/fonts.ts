import localFont from "next/font/local";

/** Body + UI text — GothamNarrow Medium (site's `type-body`). */
export const gothamMedium = localFont({
  src: "../fonts/GothamMedium-Regular.woff2",
  weight: "400",
  variable: "--ff-gotham-med",
  display: "swap",
});

/** Display + bold emphasis — GothamNarrow Bold (site's `type-body-alt` / `font-bold`). */
export const gothamBold = localFont({
  src: "../fonts/GothamBold-Regular.woff2",
  weight: "400",
  variable: "--ff-gotham-bold",
  display: "swap",
});

/** Huge condensed uppercase section titles (site's `type-title`). */
export const notoExtraCondensed = localFont({
  src: "../fonts/NotoSans_ExtraCondensed-Bold-Regular.woff2",
  weight: "400",
  variable: "--ff-noto-cond",
  display: "swap",
});

/** Secondary labels — routes, codes, bracket statuses (site's `font-secondary`). */
export const notoMonoBold = localFont({
  src: "../fonts/NotoSansMono-Bold-Regular.woff2",
  weight: "400",
  variable: "--ff-noto-mono",
  display: "swap",
});

/** Thermal-printer display for ticket panels (site's `MD Thermochrome 0.4`). */
export const thermoSemibold = localFont({
  src: "../fonts/MDThermochromeSemibold-Regular.woff2",
  weight: "400",
  variable: "--ff-thermo",
  display: "swap",
});
