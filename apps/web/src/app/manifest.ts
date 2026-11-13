import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    // A stable id keeps an installed app the same app if start_url ever moves.
    id: "/home",
    name: "BorrowBuddy: campus lending",
    short_name: "BorrowBuddy",
    description:
      "Borrow what you need, lend what you don't. Verified Bennett University students only.",
    lang: "en",
    dir: "ltr",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Splash = canvas blue (matches the iOS startup images); system bars =
    // black, like the app shell's header panel.
    background_color: "#003993",
    theme_color: "#000000",
    categories: ["education", "social", "utilities"],
    prefer_related_applications: false,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    // Long-press the home-screen icon (Android) for these jump-ins.
    shortcuts: [
      { name: "Browse", url: "/home", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Dashboard", url: "/dashboard", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Chat", url: "/chat", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Lend an item", url: "/items/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
