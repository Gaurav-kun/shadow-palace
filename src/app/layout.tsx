import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Inter, Literata, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { AppShell } from "@/components/shell/AppShell";
import { SWRegister } from "@/components/SWRegister";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Shadow Palace", template: "%s · Shadow Palace" },
  description:
    "A personal manga, manhwa and light-novel reader. Dark, fast, yours.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Shadow Palace",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07060b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} ${literata.variable} h-full`}
    >
      <body className="min-h-dvh bg-void text-moon antialiased">
        {/* Warm up MangaDex connections before data lands */}
        <link rel="preconnect" href="https://api.mangadex.org" />
        <link rel="preconnect" href="https://uploads.mangadex.org" />
        <link rel="dns-prefetch" href="https://uploads.mangadex.org" />
        <Providers>
          <Suspense fallback={<div className="min-h-dvh bg-void" />}>
            <AppShell>{children}</AppShell>
          </Suspense>
        </Providers>
        <SWRegister />
      </body>
    </html>
  );
}
