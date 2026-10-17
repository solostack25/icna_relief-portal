import type { MetadataRoute } from "next";

// Makes the portal installable as an app on phones (and desktops):
// Android/Chrome shows "Install app", iPhone uses Share → Add to Home
// Screen. Served at /manifest.webmanifest and linked automatically.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/select-app",
    name: "ICNA Relief Portal",
    short_name: "ICNA Relief",
    description: "Internal staff portal for ICNA Relief programs",
    // Signed-in staff land on their app picker; anyone signed out is sent
    // to the sign-in page by the middleware.
    start_url: "/select-app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf7ef",
    theme_color: "#1f6f54",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Helpdesk", url: "/helpdesk", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Client intake", url: "/intake", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Directory", url: "/directory", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
