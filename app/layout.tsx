import "./globals.css";
import HadithBanner from "./HadithBanner";

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
        <HadithBanner />
        {children}
      </body>
    </html>
  );
}
