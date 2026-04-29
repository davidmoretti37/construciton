import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
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
  keywords: [
    "service business management",
    "AI estimates",
    "construction management app",
    "contractor software",
    "invoice tracking",
    "project management",
    "field service management",
    "HVAC software",
    "plumbing business app",
    "landscaping management",
  ],
  alternates: {
    canonical: "https://sylkapp.ai",
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
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
