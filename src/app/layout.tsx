import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Green Lake Guest House | Reservation Management",
  description: "Hotel reservation management system for Green Lake Guest House, South Africa.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
