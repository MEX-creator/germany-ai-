import "@/styles/globals.css";
import { Raleway } from "next/font/google";
import { Toaster } from "sonner";
import type { Metadata, Viewport } from "next";

const ralway = Raleway({ subsets: ["latin"], variable: "--font-ralway" });

export const metadata: Metadata = {
  title: "Sprache AI — Learn German",
  description:
    "An AI-powered German learning chat tutor. Practice conversations, learn vocabulary, and master German with spaced repetition.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Sprache",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#dc2626",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${ralway.variable}`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="overscroll-none">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
