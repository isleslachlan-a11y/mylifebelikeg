import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Starmap",
  description: "Plan your goals, trips, and budgets in one place.",
};

// viewport-fit=cover is what makes env(safe-area-inset-*) resolve to a
// real value on notched/home-indicator devices instead of 0 — the mobile
// tab bar's safe-area padding depends on it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`h-full ${inter.variable} ${instrumentSerif.variable}`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
