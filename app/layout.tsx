import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, JetBrains_Mono, Onest } from "next/font/google";
import "./globals.css";
import { CloudSync } from "@/lib/sync";
import { PwaRuntime } from "@/components/pwa-install";
import { ResponsiveShell } from "@/components/responsive-shell";
import { ProductAnalytics } from "@/components/product-analytics";

const badgerDisplay = Bricolage_Grotesque({
  variable: "--font-badger-display",
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
  display: "swap",
});

const badgerUi = Onest({
  variable: "--font-badger-ui",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://badger.example.com"),
  title: "Badger AI | Your AI co-founder, right in your messages.",
  description:
    "Tell Bo what you are building. Get one clear move a day, practical help and follow-up until you launch in 28 days.",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Your AI co-founder, right in your messages.",
    description:
      "Bo turns your idea into one clear move a day and follows up until you launch in 28 days.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Your AI co-founder, right in your messages.",
    description: "Bo gives you one clear move a day and follows up until you launch in 28 days.",
  },
  appleWebApp: {
    capable: true,
    title: "Badger AI",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#faf7f0",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${badgerDisplay.variable} ${badgerUi.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ProductAnalytics />
        <CloudSync />
        <PwaRuntime />
        <ResponsiveShell>{children}</ResponsiveShell>
      </body>
    </html>
  );
}
