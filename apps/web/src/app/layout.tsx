import type { Metadata, Viewport } from "next";
import { IosInputZoomGuard } from "@/components/ios-input-zoom";
import { ServiceWorkerRegistrar } from "@/components/service-worker";
import { MotionProvider } from "@/components/motion-provider";
import {
  gothamBold,
  gothamMedium,
  notoExtraCondensed,
  notoMonoBold,
  thermoSemibold,
} from "./fonts";
import "./globals.css";

/** iPhone launch screens for home-screen installs (portrait only — the
 *  manifest locks orientation). Generated at device resolution: canvas blue
 *  with the cargo mark, ~2–5 KB each, and iOS fetches only the one whose
 *  media query matches the phone. */
const STARTUP_IMAGES = (
  [
    [440, 956, 3],
    [430, 932, 3],
    [428, 926, 3],
    [420, 912, 3],
    [414, 896, 3],
    [414, 896, 2],
    [414, 736, 3],
    [402, 874, 3],
    [393, 852, 3],
    [390, 844, 3],
    [375, 812, 3],
    [375, 667, 2],
    [320, 568, 2],
  ] as const
).map(([width, height, ratio]) => ({
  url: `/splash/iphone-${width * ratio}x${height * ratio}.png`,
  media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`,
}));

export const metadata: Metadata = {
  title: {
    default: "BorrowBuddy — Campus lending, delivered",
    template: "%s · BorrowBuddy",
  },
  description:
    "Bennett University's campus lending network. Verified students only — borrow what you need, lend what you don't, hand over by QR.",
  applicationName: "BorrowBuddy",
  appleWebApp: {
    capable: true,
    title: "BorrowBuddy",
    // Content runs under the status bar; globals.css pads it back out with
    // env(safe-area-inset-top) and lays a black plate behind the clock.
    statusBarStyle: "black-translucent",
    startupImage: STARTUP_IMAGES,
  },
  // Handover codes and PINs are digits — keep iOS from turning them into
  // tappable phone numbers.
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: { url: "/icons/apple-touch-icon.png", sizes: "180x180" },
  },
  other: {
    // Next emits only the unprefixed `mobile-web-app-capable`; older iOS
    // releases look for Apple's name before they honour standalone mode.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  // Black matches the app shell's header and the iOS status-bar plate.
  themeColor: "#000000",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // Draw under the notch / home indicator; safe-area insets pad it back.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${gothamMedium.variable} ${gothamBold.variable} ${notoExtraCondensed.variable} ${notoMonoBold.variable} ${thermoSemibold.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        {/* one continuous photographic backdrop for the landing page — fixed
            plate + batik print; opaque pages (login, app shell, preloader)
            cover it, transparent landing sections let it through. Placed
            outside the page template's animated wrapper so `fixed` anchors
            to the viewport, not the template's transform box. */}
        <div aria-hidden className="backdrop-photo fixed inset-0 -z-10">
          <div aria-hidden className="batik-corner absolute inset-0" />
          {/* bottom vignette — keeps white text readable over the light band */}
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-[38vh]"
            style={{
              background: "linear-gradient(180deg, transparent, rgba(2,10,40,0.5))",
            }}
          />
        </div>
        <MotionProvider>
          {children}
          <ServiceWorkerRegistrar />
          <IosInputZoomGuard />
        </MotionProvider>
      </body>
    </html>
  );
}
