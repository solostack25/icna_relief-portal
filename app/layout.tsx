import "./globals.css";
import HadithBanner from "./HadithBanner";
import ClockReminderWatcher from "@/components/ClockReminderWatcher";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";

export const metadata = {
  title: "ICNA Relief Portal",
  description: "Internal staff portal for ICNA Relief programs",
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
