import Link from "next/link";
import { notFound } from "next/navigation";
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

type PoetPageProps = {
  params: Promise<{
    id: string;
  }>;
};

type PoetPoem = {
  id: string;
  title: string;
  content_html: string;
  title_font: string | null;
  content_font: string | null;
  created_at: string;
  updated_at: string;
};

type CommentCountRow = {
  poem_id: string;
  comment_count: number | string | null;
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

  const poemsResult = await supabase
    .from("poems")
    .select("id, title, content_html, title_font, content_font, created_at, updated_at")
    .eq("author_id", id)
    .eq("is_published", true)
    .order("created_at", { ascending: false });
  
  let publishedPoems: PoetPoem[] = [];
  if (isMissingPoemFontColumnsError(poemsResult.error)) {
    const legacyPoemsResult = await supabase
      .from("poems")
      .select("id, title, content_html, created_at, updated_at")
      .eq("author_id", id)
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (legacyPoemsResult.error) {
      throw legacyPoemsResult.error;
    }

    publishedPoems = (legacyPoemsResult.data ?? []).map((poem) => ({
      ...poem,
      title_font: null,
      content_font: null,
    })) as PoetPoem[];
  } else {
    if (poemsResult.error) {
      throw poemsResult.error;
    }

    publishedPoems = (poemsResult.data ?? []) as PoetPoem[];
  }
  const poemIds = publishedPoems.map((poem) => poem.id);

  const likeCountByPoem = new Map<string, number>();
  const likedByUser = new Set<string>();
  if (poemIds.length > 0) {
    const { data: reactions, error: reactionsError } = await supabase
      .from("reactions")
      .select("poem_id, user_id")
      .in("poem_id", poemIds);

    if (reactionsError) {
      throw reactionsError;
    }

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
              const likeCount = likeCountByPoem.get(poem.id) ?? 0;
              const liked = likedByUser.has(poem.id);
              const commentCount = commentCountByPoem.get(poem.id) ?? 0;
              const isOwner = user?.id === id;

              return (
                <article
                  key={poem.id}
                  id={`poem-${poem.id}`}
                  className="relative rounded border border-ant-border bg-ant-paper p-5"
                >
                  <MobileCommentsPrefetch poemId={poem.id} />
                  <PoemCardMenu
                    poemId={poem.id}
                    poemTitle={poem.title}
                    isOwner={Boolean(isOwner)}
                    deletePoemAction={deletePoemAction}
                  />

                  <h3
                    className="pr-10 font-serif text-2xl text-ant-primary"
                    style={{ fontFamily: getPoemFontFamily(poem.title_font) }}
                  >
                    {poem.title}
                  </h3>
                  <p className="mt-1 text-xs text-ant-ink/70">Published on {formatDate(poem.created_at)}</p>

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
        )}
      </div>
    </section>
  );
}
