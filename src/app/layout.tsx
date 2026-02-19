import type { Metadata } from "next";
import { Inter, Lora, Playfair_Display } from "next/font/google";

import { Header } from "@/components/header";

import "./globals.css";

const headingFont = Lora({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
});

const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const playfairFont = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Written by Ants",
    template: "%s | Written by Ants",
  },
  description: "Poetry publishing platform powered by Next.js and Supabase.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${headingFont.variable} ${bodyFont.variable} ${playfairFont.variable} min-h-screen bg-ant-paper text-ant-ink`}
      >
        <div className="min-h-screen bg-paper-grain">
          <Header />
          <main className="mx-auto w-full max-w-5xl px-4 pb-10">{children}</main>
        </div>
      </body>
    </html>
  );
}
