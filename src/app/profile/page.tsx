import Link from "next/link";
import { redirect } from "next/navigation";

import { deletePoemAction } from "@/app/actions";
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

type PoemWithSafeHtml = UserPoem & {
  safe_content_html: string;
  comment_count: number;
  like_count: number;
  liked_by_user: boolean;
};

type CommentCountRow = {
  poem_id: string;
  comment_count: number | string | null;
};

type ProfilePageProps = {
  searchParams: Promise<{
    tab?: string;
  }>;
};

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
  const commentCountByPoem = new Map<string, number>();
  const poemIds = userPoems.map((poem) => poem.id);
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
      if (reaction.user_id === user.id) {
        likedByUser.add(reaction.poem_id);
      }
    });
  }

  const poemsWithSafeHtml: PoemWithSafeHtml[] = userPoems.map((poem) => ({
    ...poem,
    safe_content_html: sanitizePoemHtml(poem.content_html),
    comment_count: commentCountByPoem.get(poem.id) ?? 0,
    like_count: likeCountByPoem.get(poem.id) ?? 0,
    liked_by_user: likedByUser.has(poem.id),
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
