import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { Heart } from "lucide-react";

import { DeletePoemForm } from "@/components/delete-poem-form";
import { PoemComments } from "@/components/poem-comments";
import { PoemLikeControl } from "@/components/poem-like-control";
import { getPoemFontFamily, isMissingPoemFontColumnsError } from "@/lib/poem-fonts";
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
  title_font: string | null;
  content_font: string | null;
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

  const poemResult = await supabase
    .from("poems")
    .select("id, title, content_html, title_font, content_font, author_id, is_published, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  let typedPoem: PoemRecord | null = null;
  if (isMissingPoemFontColumnsError(poemResult.error)) {
    const legacyPoemResult = await supabase
      .from("poems")
      .select("id, title, content_html, author_id, is_published, created_at, updated_at")
      .eq("id", id)
      .maybeSingle();

    if (legacyPoemResult.error) {
      throw legacyPoemResult.error;
    }

    if (legacyPoemResult.data) {
      typedPoem = {
        ...legacyPoemResult.data,
        title_font: null,
        content_font: null,
      } as PoemRecord;
    }
  } else {
    if (poemResult.error) {
      throw poemResult.error;
    }

    typedPoem = poemResult.data as PoemRecord | null;
  }

  if (!typedPoem) {
    notFound();
  }
  const isAuthor = user?.id === typedPoem.author_id;

  if (!typedPoem.is_published && !isAuthor) {
    notFound();
  }

  async function deletePoemAction(formData: FormData) {
    "use server";

    const poemId = String(formData.get("poem_id") ?? "").trim();
    if (!poemId) {
      redirect("/profile");
    }

    const actionSupabase = await createClient();
    const {
      data: { user: actionUser },
    } = await actionSupabase.auth.getUser();

    if (!actionUser) {
      redirect("/login");
    }

    await actionSupabase
      .from("poems")
      .delete()
      .eq("id", poemId)
      .eq("author_id", actionUser.id);

    revalidatePath("/");
    revalidatePath("/profile");
    revalidatePath(`/poem/${poemId}`);
    revalidatePath(`/poet/${actionUser.id}`);
    redirect("/profile");
  }

  const { data: authorProfile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", typedPoem.author_id)
    .maybeSingle();

  const authorName = authorProfile?.display_name ?? "Unknown Poet";
  const authorHref = user?.id === typedPoem.author_id ? "/profile" : `/poet/${typedPoem.author_id}`;
  const currentUserName = user?.id === typedPoem.author_id ? authorName : null;
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
        <h1 className="font-serif text-4xl text-ant-primary" style={{ fontFamily: getPoemFontFamily(typedPoem.title_font) }}>
          {typedPoem.title}
        </h1>
        <p className="mt-2 text-sm text-ant-ink/80">
          by{" "}
          <Link href={authorHref} className="text-ant-primary transition hover:underline">
            {authorName}
          </Link>{" "}
          on {formatDate(typedPoem.created_at)}
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
            <DeletePoemForm
              poemId={typedPoem.id}
              deletePoemAction={deletePoemAction}
              className="cursor-pointer rounded border border-ant-border px-2 py-1 text-ant-primary transition hover:border-ant-primary hover:bg-ant-primary hover:text-ant-paper"
            />
          </div>
        ) : null}
      </header>

      <section
        className="prose-poem"
        style={{ fontFamily: getPoemFontFamily(typedPoem.content_font) }}
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />

      <footer className="mt-6 border-t border-ant-border pt-4 text-sm">
        {typedPoem.is_published ? (
          <>
            {user ? (
              <PoemLikeControl
                poemId={typedPoem.id}
                initialLiked={likedByUser}
                initialLikeCount={likeCount}
              />
            ) : (
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
            )}
          </>
        ) : (
          <span className="text-ant-ink/70">Drafts are only visible to their author.</span>
        )}
      </footer>

      {typedPoem.is_published ? (
        <PoemComments
          poemId={typedPoem.id}
          isSignedIn={Boolean(user)}
          currentUserId={user?.id ?? null}
          currentUserName={currentUserName}
        />
      ) : (
        <section className="mt-8 border-t border-ant-border pt-5">
          <h2 className="font-serif text-2xl text-ant-primary">Comments</h2>
          <p className="mt-3 text-sm text-ant-ink/70">Comments are available after publishing.</p>
        </section>
      )}
    </article>
  );
}
