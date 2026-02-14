import Link from "next/link";

import { HeaderUserMenu } from "@/components/header-user-menu";
import { createClient } from "@/lib/supabase/server";

export async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let poetName: string | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    poetName = profile?.display_name ?? user.email?.split("@")[0] ?? "Poet";
  }

  return (
    <header className="sticky top-0 z-40 mb-6 border-b border-ant-border bg-ant-paper-2/90 px-4 py-4 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
        <Link
          href="/"
          className="font-serif text-2xl font-semibold tracking-tight text-ant-primary transition hover:text-ant-accent"
        >
          Written by Ants
        </Link>

        <nav className="flex items-center gap-3 overflow-visible text-sm text-ant-ink">
          {user ? (
            <>
              <Link href="/write" className="text-ant-primary transition hover:text-ant-accent">
                Write
              </Link>
              <HeaderUserMenu poetName={poetName ?? "Poet"} />
            </>
          ) : (
            <Link href="/login" className="text-ant-primary transition hover:text-ant-accent">
              Login
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
