import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sylk — AI-Powered Service Business Management",
  description:
    "Create estimates, manage projects, track finances, and grow your service business with AI. Start your free trial today.",
  metadataBase: new URL("https://sylkapp.ai"),
  openGraph: {
    title: "Sylk — Run Your Business Smarter",
    description:
      "The AI-powered platform that helps service businesses create estimates, manage projects, and grow revenue.",
    url: "https://sylkapp.ai",
    siteName: "Sylk",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sylk — AI-Powered Service Business Management",
    description:
      "Create estimates, manage projects, track finances, and grow your service business with AI.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
