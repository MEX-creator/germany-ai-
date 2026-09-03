import "@/styles/globals.css";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import type { Metadata, Viewport } from "next";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sprache AI — Learn German",
  description:
    "An AI-powered German learning tutor. Practice conversations, learn vocabulary, and master German with spaced repetition.",
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
  themeColor: "#ea580c",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable}`} suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="overscroll-none font-sans antialiased">
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              borderRadius: "16px",
              padding: "12px 16px",
              fontSize: "14px",
            },
          }}
        />
      </body>
    </html>
  );
}
