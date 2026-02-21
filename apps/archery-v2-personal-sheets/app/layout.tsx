import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shoot With Ceech",
  description: "Track archery sessions with your own Google Sheet as source of truth"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
