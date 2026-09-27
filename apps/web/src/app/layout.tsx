import type { Metadata, Viewport } from "next";
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
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#003993",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
        </MotionProvider>
      </body>
    </html>
  );
}
