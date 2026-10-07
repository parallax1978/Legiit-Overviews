// Root layout: Inter Variable, the brand stylesheet and site metadata. Light theme only.
import "@fontsource-variable/inter";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: "Legiit Overviews: see what Google's AI Overview cites, then get cited",
    template: "%s · Legiit Overviews",
  },
  description:
    "Captures a Google AI Overview every 3 hours, counts the claims, brands and sources that keep showing up with the evidence for every number, studies the cited pages, writes the brief, and tracks whether your page gets cited.",
  applicationName: "Legiit Overviews",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
