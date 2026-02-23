import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://oiyen.quadrawebs.com"),

  title: {
    default: "Oiyen Investment – Smart Portfolio & Stock Analytics",
    template: "%s | Oiyen Investment",
  },

  description:
    "Track stocks, manage portfolios, and run backtesting strategies with Oiyen Investment App.",

  icons: {
    icon: "/oiyen-logo.ico",          // Browser tab icon
    shortcut: "/oiyen-logo.ico",
    apple: "/oiyen-logo.png",
  },

  openGraph: {
    title: "Oiyen Investment – Smart Portfolio & Stock Analytics",
    description:
      "Track stocks, manage portfolios, and run backtesting strategies with Oiyen Investment App.",
    url: "https://oiyen.quadrawebs.com",
    siteName: "Oiyen Investment",
    images: [
      {
        url: "/oiyen_card.png",
        width: 1200,
        height: 630,
        alt: "Oiyen Investment Dashboard Preview",
      },
    ],
    locale: "en_US",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
