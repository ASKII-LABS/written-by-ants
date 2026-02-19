import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ProfilePoemTabs } from "@/components/profile-poem-tabs";
import { isMissingPoemFontColumnsError } from "@/lib/poem-fonts";
import { sanitizePoemHtml } from "@/lib/sanitize";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type UserPoem = {
  id: string;
  title: string;
  content_html: string;
  title_font: string | null;
  content_font: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

type ProfilePageProps = {
  searchParams: Promise<{
    tab?: string;
  }>;
};

async function deletePoemAction(formData: FormData) {
  "use server";

  const poemId = String(formData.get("poem_id") ?? "").trim();
  if (!poemId) {
    redirect("/profile");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  await supabase
    .from("poems")
    .delete()
    .eq("id", poemId)
    .eq("author_id", user.id);

  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath(`/poem/${poemId}`);
  revalidatePath(`/poet/${user.id}`);
  redirect("/profile");
}

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, bio")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/onboarding");
  }

  const poemsResult = await supabase
    .from("poems")
    .select("id, title, content_html, title_font, content_font, is_published, created_at, updated_at")
    .eq("author_id", user.id)
    .order("updated_at", { ascending: false });
  
  let userPoems: UserPoem[] = [];
  if (isMissingPoemFontColumnsError(poemsResult.error)) {
    const legacyPoemsResult = await supabase
      .from("poems")
      .select("id, title, content_html, is_published, created_at, updated_at")
      .eq("author_id", user.id)
      .order("updated_at", { ascending: false });

    if (legacyPoemsResult.error) {
      throw legacyPoemsResult.error;
    }

    userPoems = (legacyPoemsResult.data ?? []).map((poem) => ({
      ...poem,
      title_font: null,
      content_font: null,
    })) as UserPoem[];
  } else {
    if (poemsResult.error) {
      throw poemsResult.error;
    }

    userPoems = (poemsResult.data ?? []) as UserPoem[];
  }
  const poemsWithSafeHtml = userPoems.map((poem) => ({
    ...poem,
    safe_content_html: sanitizePoemHtml(poem.content_html),
  }));
  const publishedPoems = poemsWithSafeHtml.filter((poem) => poem.is_published);
  const draftPoems = poemsWithSafeHtml.filter((poem) => !poem.is_published);
  const poetName = profile.display_name ?? user.email?.split("@")[0] ?? "Poet";
  const bio = profile.bio?.trim();
  const { tab } = await searchParams;
  const initialTab = tab === "drafts" ? "drafts" : "published";

  return (
    <section className="space-y-6">
      <div className="rounded border border-ant-border bg-ant-paper-2 p-5">
        <h1 className="font-serif text-3xl text-ant-primary">{poetName}</h1>
        <p className="mt-2 whitespace-pre-line text-sm text-ant-ink/80">
          {bio && bio.length > 0 ? bio : "No bio yet."}
        </p>
      </div>

      <div className="rounded border border-ant-border bg-ant-paper-2 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-2xl text-ant-primary">Poems</h2>
          <Link
            href="/write"
            className="rounded border border-ant-primary bg-ant-primary px-3 py-2 text-sm font-medium text-ant-paper transition hover:bg-ant-accent"
          >
            New poem
          </Link>
        </div>

        <ProfilePoemTabs
          publishedPoems={publishedPoems}
          draftPoems={draftPoems}
          deletePoemAction={deletePoemAction}
          initialTab={initialTab}
        />
      </div>
    </section>
  );
}
