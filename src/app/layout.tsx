import type { Metadata } from "next";
import { Inter, Lora, Playfair_Display } from "next/font/google";

import { CommentsDrawerProvider } from "@/components/comments-drawer-provider";
import { Header } from "@/components/header";
import { DEFAULT_THEME, type AppTheme, isMissingThemeColumnError, normalizeTheme } from "@/lib/theme";
import { createClient } from "@/lib/supabase/server";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let activeTheme: AppTheme = DEFAULT_THEME;
  if (user) {
    const profileWithThemeResult = await supabase
      .from("profiles")
      .select("theme")
      .eq("id", user.id)
      .maybeSingle();

    if (isMissingThemeColumnError(profileWithThemeResult.error)) {
      activeTheme = DEFAULT_THEME;
    } else if (!profileWithThemeResult.error) {
      activeTheme = normalizeTheme(profileWithThemeResult.data?.theme);
    }
  }

  const currentYear = new Date().getFullYear();

  return (
    <html lang="en" data-theme={activeTheme}>
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
