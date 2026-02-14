import Link from "next/link";

import { toggleLikeAction } from "@/app/actions";
import { sanitizePoemHtml } from "@/lib/sanitize";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

type FeedPoem = {
  id: string;
  title: string;
  content_html: string;
  author_id: string;
  created_at: string;
};

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: poems, error: poemsError } = await supabase
    .from("poems")
    .select("id, title, content_html, author_id, created_at")
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  if (poemsError) {
    throw poemsError;
  }

  const feedPoems = (poems ?? []) as FeedPoem[];
  const authorIds = Array.from(new Set(feedPoems.map((poem) => poem.author_id)));
  const poemIds = feedPoems.map((poem) => poem.id);

  const authorMap = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", authorIds);

    (profiles ?? []).forEach((profile) => {
      authorMap.set(profile.id, profile.display_name);
    });
  }

  const likeCountByPoem = new Map<string, number>();
  const likedByUser = new Set<string>();
  if (poemIds.length > 0) {
    const { data: reactions } = await supabase
      .from("reactions")
      .select("poem_id, user_id")
      .in("poem_id", poemIds);

    (reactions ?? []).forEach((reaction) => {
      likeCountByPoem.set(reaction.poem_id, (likeCountByPoem.get(reaction.poem_id) ?? 0) + 1);
      if (user && reaction.user_id === user.id) {
        likedByUser.add(reaction.poem_id);
      }
    });
  }

  return (
    <section className="space-y-6">
      <div className="rounded border border-ant-border bg-ant-paper-2 p-5">
        <h1 className="font-serif text-3xl text-ant-primary">Poems in the colony</h1>
        <p className="mt-1 text-sm text-ant-ink/80">
          Freshly published poems in chronological order.
        </p>
      </div>

      <div className="space-y-4">
        {feedPoems.length === 0 ? (
          <div className="rounded border border-ant-border bg-ant-paper-2 p-5 text-sm text-ant-ink/80">
            No published poems yet.
          </div>
        ) : null}

        {feedPoems.map((poem) => {
          const likeCount = likeCountByPoem.get(poem.id) ?? 0;
          const liked = likedByUser.has(poem.id);
          const authorName = authorMap.get(poem.author_id) ?? "Unknown Poet";
          const safeHtml = sanitizePoemHtml(poem.content_html);

          return (
            <article key={poem.id} className="rounded border border-ant-border bg-ant-paper-2 p-5">
              <h2 className="font-serif text-2xl text-ant-primary">
                <Link href={`/poem/${poem.id}`} className="transition hover:text-ant-accent">
                  {poem.title}
                </Link>
              </h2>
              <p className="mt-1 text-xs text-ant-ink/70">
                by {authorName} on {formatDate(poem.created_at)}
              </p>

              <section
                className="prose-poem mt-3 text-ant-ink/90"
                dangerouslySetInnerHTML={{ __html: safeHtml }}
              />

              <div className="mt-4 flex items-center gap-3 text-sm">
                {user ? (
                  <form action={toggleLikeAction}>
                    <input type="hidden" name="poem_id" value={poem.id} />
                    <button
                      type="submit"
                      className="cursor-pointer rounded border border-ant-border px-3 py-1 transition hover:border-ant-primary hover:text-ant-primary"
                    >
                      {liked ? "Unlike" : "Like"}
                    </button>
                  </form>
                ) : (
                  <Link
                    href="/login"
                    className="rounded border border-ant-border px-3 py-1 transition hover:border-ant-primary hover:text-ant-primary"
                  >
                    Like
                  </Link>
                )}
                <span className="text-ant-ink/70">{likeCount} likes</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
