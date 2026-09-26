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
  title: {
    default: "SEOTool — Open-Source AI-Powered SEO Intelligence & Audit Platform",
    template: "%s | SEOTool",
  },
  description:
    "Production-grade, zero-paid-API autonomous SEO crawler, AI Answer Engine Optimization (AEO), Core Web Vitals, and deep technical auditing platform.",
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png" },
      { url: "/favicon.png", type: "image/png" },
    ],
    apple: "/icon.png",
  },
  authors: [{ name: "Atique Ullah", url: "https://www.linkedin.com/in/atiqueullahlimon" }],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
