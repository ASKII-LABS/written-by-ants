import Link from "next/link";
import { Heart } from "lucide-react";

import { deletePoemAction } from "@/app/actions";
import { CommentsTriggerButton } from "@/components/comments-trigger-button";
import { MobileCommentsPrefetch } from "@/components/mobile-comments-prefetch";
import { PoemCardMenu } from "@/components/poem-card-menu";
import { PoemLikeControl } from "@/components/poem-like-control";
import { getPoemFontFamily, isMissingPoemFontColumnsError } from "@/lib/poem-fonts";
import { sanitizePoemHtml } from "@/lib/sanitize";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

type FeedPoem = {
  id: string;
  title: string;
  content_html: string;
  title_font: string | null;
  content_font: string | null;
  author_id: string;
  created_at: string;
};

type CommentCountRow = {
  poem_id: string;
  comment_count: number | string | null;
};

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const poemsResult = await supabase
    .from("poems")
    .select("id, title, content_html, title_font, content_font, author_id, created_at")
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  let feedPoems: FeedPoem[] = [];
  if (isMissingPoemFontColumnsError(poemsResult.error)) {
    const legacyPoemsResult = await supabase
      .from("poems")
      .select("id, title, content_html, author_id, created_at")
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (legacyPoemsResult.error) {
      throw legacyPoemsResult.error;
    }

    feedPoems = (legacyPoemsResult.data ?? []).map((poem) => ({
      ...poem,
      title_font: null,
      content_font: null,
    })) as FeedPoem[];
  } else {
    if (poemsResult.error) {
      throw poemsResult.error;
    }

    feedPoems = (poemsResult.data ?? []) as FeedPoem[];
  }
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
  const commentCountByPoem = new Map<string, number>();
  if (poemIds.length > 0) {
    const commentCountResult = await supabase.rpc("comment_counts_for_poems", {
      poem_ids: poemIds,
    });

    if (!commentCountResult.error) {
      ((commentCountResult.data ?? []) as CommentCountRow[]).forEach((row) => {
        commentCountByPoem.set(row.poem_id, Number(row.comment_count ?? 0));
      });
    } else if (commentCountResult.error.code === "42883" || commentCountResult.error.code === "PGRST202") {
      const commentsResult = await supabase
        .from("comments")
        .select("poem_id")
        .in("poem_id", poemIds);

      if (commentsResult.error && commentsResult.error.code !== "42P01") {
        throw commentsResult.error;
      }

      (commentsResult.data ?? []).forEach((comment) => {
        commentCountByPoem.set(comment.poem_id, (commentCountByPoem.get(comment.poem_id) ?? 0) + 1);
      });
    } else if (commentCountResult.error.code !== "42P01") {
      throw commentCountResult.error;
    }
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
          const commentCount = commentCountByPoem.get(poem.id) ?? 0;
          const liked = likedByUser.has(poem.id);
          const isOwner = user?.id === poem.author_id;
          const authorName = authorMap.get(poem.author_id) ?? "Unknown Poet";
          const authorHref = user?.id === poem.author_id ? "/profile" : `/poet/${poem.author_id}`;
          const safeHtml = sanitizePoemHtml(poem.content_html);

          return (
            <article
              key={poem.id}
              id={`poem-${poem.id}`}
              className="relative rounded border border-ant-border bg-ant-paper-2 p-5"
            >
              <MobileCommentsPrefetch poemId={poem.id} />
              <PoemCardMenu
                poemId={poem.id}
                poemTitle={poem.title}
                isOwner={Boolean(isOwner)}
                deletePoemAction={deletePoemAction}
              />

              <h2
                className="pr-10 font-serif text-2xl text-ant-primary"
                style={{ fontFamily: getPoemFontFamily(poem.title_font) }}
              >
                {poem.title}
              </h2>
              <p className="mt-1 text-xs text-ant-ink/70">
                by{" "}
                <Link href={authorHref} className="text-ant-primary transition hover:underline">
                  {authorName}
                </Link>{" "}
                on {formatDate(poem.created_at)}
              </p>

              <section
                className="prose-poem mt-3 text-ant-ink/90"
                style={{ fontFamily: getPoemFontFamily(poem.content_font) }}
                dangerouslySetInnerHTML={{ __html: safeHtml }}
              />

              <div className="mt-4 text-sm">
                {user ? (
                  <div className="flex items-center gap-3">
                    <PoemLikeControl
                      poemId={poem.id}
                      initialLiked={liked}
                      initialLikeCount={likeCount}
                    />
                    <CommentsTriggerButton poemId={poem.id} commentCount={commentCount} />
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <Link
                        href="/login"
                        aria-label="Sign in to like this poem"
                        className="inline-flex items-center justify-center p-1 text-ant-ink/70 transition hover:text-ant-primary"
                      >
                        <Heart aria-hidden="true" className="h-5 w-5" />
                      </Link>
                      <span className="tabular-nums text-ant-ink/70">{likeCount}</span>
                    </div>
                    <CommentsTriggerButton poemId={poem.id} commentCount={commentCount} />
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
