import "./globals.css";
import HadithBanner from "./HadithBanner";
import ClockReminderWatcher from "@/components/ClockReminderWatcher";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import PwaSetup from "@/components/PwaSetup";
import PortalCallBar from "@/components/PortalCallBar";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "ICNA Relief Portal",
  description: "Internal staff portal for ICNA Relief programs",
  // Phone app (PWA): app/manifest.ts is linked automatically. These cover
  // iPhone, which reads its own tags for the home-screen icon and title.
  applicationName: "ICNA Relief",
  appleWebApp: {
    capable: true,
    title: "ICNA Relief",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

// Missing until now - without this, mobile Chrome/Safari render the page
// at a fake ~980px "desktop" layout viewport and the user has to pinch-
// zoom out to see the whole thing, which is why sm:/md:/lg: breakpoints
// never fired on phones anywhere in the portal, not just the flier
// builder. viewport-fit=cover lets pages that want it sit edge-to-edge
// on notched phones; nothing currently relies on that, it's just harmless
// to include now rather than needing a second pass later.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Colors the phone's status bar / app switcher card when installed.
  themeColor: "#1f6f54",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Real <link> tags instead of CSS @import in globals.css - @import
            rules must be the first rules in a stylesheet per spec, and
            Tailwind v4's `@import "tailwindcss";` expands into a large
            generated block at build time. If that expansion ends up ahead
            of the font @imports in the final CSS, browsers silently drop
            those imports as invalid (no error, fonts just never load) -
            which would explain the 3 original brand fonts never reliably
            loading either, not just the new font library. Link tags in
            <head> aren't order-sensitive this way. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;1,9..144,500;1,9..144,600&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&family=Pacifico&family=Dancing+Script:wght@400;700&family=Caveat:wght@400;700&family=Permanent+Marker&family=Sacramento&family=Bebas+Neue&family=Anton&family=Righteous&family=Passion+One:wght@400;700&family=Alfa+Slab+One&family=Playfair+Display:wght@400;700;900&family=Abril+Fatface&family=Cormorant+Garamond:wght@400;600;700&family=Poppins:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700&family=Oswald:wght@400;500;600;700&family=Raleway:wght@400;500;600;700&family=Work+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        <LanguageProvider>
          <HadithBanner />
          <ClockReminderWatcher />
          {children}
          <PortalCallBar />
          <PwaSetup />
        </LanguageProvider>
      </body>
    </html>
  );
}
