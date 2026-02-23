import type { Viewport } from "next";
import "./globals.css";

export const metadata = {
  title: "ArrowLog",
  description: "Track archery sessions with your own Google Sheet as source of truth"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
