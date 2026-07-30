import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

const publicAppUrl = process.env.PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(publicAppUrl),
  applicationName: "SkillUp",
  title: {
    default: "SkillUp — Learn. Play. Level Up.",
    template: "%s | SkillUp",
  },
  description:
    "Build practical skills through short mobile-first learning games designed for Pakistani learners.",
  alternates: {
    canonical: "/en",
  },
  openGraph: {
    type: "website",
    locale: "en_PK",
    siteName: "SkillUp",
    title: "SkillUp — Learn. Play. Level Up.",
    description:
      "Build practical skills through short mobile-first learning games designed for Pakistani learners.",
    url: "/en",
  },
  twitter: {
    card: "summary",
    title: "SkillUp — Learn. Play. Level Up.",
    description: "Short practical learning games for Pakistani learners.",
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#4338CA",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
