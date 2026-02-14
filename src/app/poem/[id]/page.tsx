import Link from "next/link";
import { notFound } from "next/navigation";

import { toggleLikeAction } from "@/app/actions";
import { sanitizePoemHtml } from "@/lib/sanitize";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PoemPageProps = {
  params: Promise<{
    id: string;
  }>;
};

type PoemRecord = {
  id: string;
  title: string;
  content_html: string;
  author_id: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export default async function PoemPage({ params }: PoemPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: poem } = await supabase
    .from("poems")
    .select("id, title, content_html, author_id, is_published, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (!poem) {
    notFound();
  }

  const typedPoem = poem as PoemRecord;
  const isAuthor = user?.id === typedPoem.author_id;

  if (!typedPoem.is_published && !isAuthor) {
    notFound();
  }

  const { data: authorProfile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", typedPoem.author_id)
    .maybeSingle();

  const authorName = authorProfile?.display_name ?? "Unknown Poet";
  const safeHtml = sanitizePoemHtml(typedPoem.content_html);

  let likeCount = 0;
  let likedByUser = false;
  if (typedPoem.is_published) {
    const { data: reactions } = await supabase
      .from("reactions")
      .select("user_id")
      .eq("poem_id", typedPoem.id);

    likeCount = reactions?.length ?? 0;
    likedByUser = Boolean(user && reactions?.some((reaction) => reaction.user_id === user.id));
  }

  return (
    <article className="rounded border border-ant-border bg-ant-paper-2 p-6">
      <header className="mb-6 border-b border-ant-border pb-4">
        <h1 className="font-serif text-4xl text-ant-primary">{typedPoem.title}</h1>
        <p className="mt-2 text-sm text-ant-ink/80">
          by {authorName} on {formatDate(typedPoem.created_at)}
        </p>

        {isAuthor ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded border border-ant-border px-2 py-1 text-ant-ink/70">
              {typedPoem.is_published ? "Published" : "Draft"}
            </span>
            <Link
              href={`/write?id=${typedPoem.id}`}
              className="rounded border border-ant-border px-2 py-1 transition hover:border-ant-primary hover:text-ant-primary"
            >
              Edit
            </Link>
          </div>
        ) : null}
      </header>

      <section className="prose-poem" dangerouslySetInnerHTML={{ __html: safeHtml }} />

      <footer className="mt-6 flex items-center gap-3 border-t border-ant-border pt-4 text-sm">
        {typedPoem.is_published ? (
          <>
            {user ? (
              <form action={toggleLikeAction}>
                <input type="hidden" name="poem_id" value={typedPoem.id} />
                <button
                  type="submit"
                  className="cursor-pointer rounded border border-ant-border px-3 py-1 transition hover:border-ant-primary hover:text-ant-primary"
                >
                  {likedByUser ? "Unlike" : "Like"}
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
          </>
        ) : (
          <span className="text-ant-ink/70">Drafts are only visible to their author.</span>
        )}
      </footer>
    </article>
  );
}
