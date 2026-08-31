import "./globals.css";
import HadithBanner from "./HadithBanner";
import ClockReminderWatcher from "@/components/ClockReminderWatcher";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import type { Viewport } from "next";

export const metadata = {
  title: "ICNA Relief Portal",
  description: "Internal staff portal for ICNA Relief programs",
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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>
          <HadithBanner />
          <ClockReminderWatcher />
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
