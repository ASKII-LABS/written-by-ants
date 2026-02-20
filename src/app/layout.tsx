import type { Metadata } from "next";
import { Inter, Lora, Playfair_Display } from "next/font/google";

import { CommentsDrawerProvider } from "@/components/comments-drawer-provider";
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
  const currentYear = new Date().getFullYear();

  return (
    <html lang="en">
      <body
        className={`${headingFont.variable} ${bodyFont.variable} ${playfairFont.variable} min-h-screen bg-ant-paper text-ant-ink`}
      >
        <div className="flex min-h-screen flex-col bg-paper-grain">
          <Header />
          <CommentsDrawerProvider>
            <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-10">{children}</main>
          </CommentsDrawerProvider>
          <footer className="border-t border-ant-border bg-ant-paper-2/80 px-4 py-4 backdrop-blur">
            <div className="mx-auto w-full max-w-5xl text-center text-xs text-ant-ink/75">
              Copyright &copy; {currentYear} ASKII Labs. All rights reserved.
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
