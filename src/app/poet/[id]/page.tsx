import Link from "next/link";
import { notFound } from "next/navigation";

import { sanitizePoemHtml } from "@/lib/sanitize";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PoetPageProps = {
  params: Promise<{
    id: string;
  }>;
};

type PoetPoem = {
  id: string;
  title: string;
  content_html: string;
  created_at: string;
  updated_at: string;
};

export default async function PoetPage({ params }: PoetPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, bio, public_profile")
    .eq("id", id)
    .maybeSingle();

  if (!profile) {
    notFound();
  }

  const isOwnProfile = user?.id === id;
  if (!profile.public_profile && !isOwnProfile) {
    notFound();
  }

  const poetName = profile.display_name ?? "Poet";
  const bio = profile.bio?.trim();

  const { data: poems } = await supabase
    .from("poems")
    .select("id, title, content_html, created_at, updated_at")
    .eq("author_id", id)
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  const publishedPoems = (poems ?? []) as PoetPoem[];

  return (
    <section className="space-y-6">
      <div className="rounded border border-ant-border bg-ant-paper-2 p-5">
        <h1 className="font-serif text-3xl text-ant-primary">{poetName}</h1>
        <p className="mt-2 whitespace-pre-line text-sm text-ant-ink/80">
          {bio && bio.length > 0 ? bio : "No bio yet."}
        </p>
      </div>

      <div className="rounded border border-ant-border bg-ant-paper-2 p-5">
        <h2 className="font-serif text-2xl text-ant-primary">Poems</h2>

        {publishedPoems.length === 0 ? (
          <p className="mt-4 text-sm text-ant-ink/70">No published poems yet.</p>
        ) : (
          <div className="mt-5 space-y-4">
            {publishedPoems.map((poem) => {
              const safeHtml = sanitizePoemHtml(poem.content_html);

              return (
                <article key={poem.id} className="rounded border border-ant-border bg-ant-paper p-5">
                  <h3 className="font-serif text-2xl text-ant-primary">
                    <Link href={`/poem/${poem.id}`} className="transition hover:text-ant-accent">
                      {poem.title}
                    </Link>
                  </h3>
                  <p className="mt-1 text-xs text-ant-ink/70">Published on {formatDate(poem.created_at)}</p>

                  <section
                    className="prose-poem mt-3 text-ant-ink/90"
                    dangerouslySetInnerHTML={{ __html: safeHtml }}
                  />
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
