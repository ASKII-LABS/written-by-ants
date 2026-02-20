import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { PoemEditor } from "@/components/poem-editor";
import { isMissingPoemFontColumnsError, normalizePoemFont } from "@/lib/poem-fonts";
import { createClient } from "@/lib/supabase/server";
import { stripHtml } from "@/lib/utils";

export const dynamic = "force-dynamic";

type WritePageProps = {
  searchParams: Promise<{
    id?: string;
    error?: string;
  }>;
};

type EditablePoem = {
  id: string;
  title: string;
  content_html: string;
  is_published: boolean;
  title_font: string | null;
  content_font: string | null;
};

function getErrorMessage(error?: string) {
  if (!error) {
    return null;
  }

  switch (error) {
    case "title_required":
      return "Title is required.";
    case "content_required":
      return "Content is required before publishing.";
    case "save_failed":
      return "Could not save poem.";
    case "delete_failed":
      return "Could not delete poem.";
    default:
      return "Could not save poem.";
  }
}

function normalizeIntent(intent: string) {
  if (intent === "publish" || intent === "unpublish" || intent === "save_draft") {
    return intent;
  }
  return "save_draft";
}

async function savePoemAction(formData: FormData) {
  "use server";

  const poemId = String(formData.get("poem_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const contentHtml = String(formData.get("content_html") ?? "<p></p>");
  const titleFont = normalizePoemFont(String(formData.get("title_font") ?? ""));
  const contentFont = normalizePoemFont(String(formData.get("content_font") ?? ""));
  const intent = normalizeIntent(String(formData.get("intent") ?? "save_draft"));

  if (!title) {
    if (poemId) {
      redirect(`/write?id=${poemId}&error=title_required`);
    }
    redirect("/write?error=title_required");
  }

  if (intent === "publish" && stripHtml(contentHtml).length === 0) {
    if (poemId) {
      redirect(`/write?id=${poemId}&error=content_required`);
    }
    redirect("/write?error=content_required");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const isPublished = intent === "publish";

  if (poemId) {
    const { data: existingPoem } = await supabase
      .from("poems")
      .select("id")
      .eq("id", poemId)
      .eq("author_id", user.id)
      .maybeSingle();

    if (!existingPoem) {
      notFound();
    }

    const timestamp = new Date().toISOString();
    const updateWithFontsResult = await supabase
      .from("poems")
      .update({
        title,
        content_html: contentHtml,
        title_font: titleFont,
        content_font: contentFont,
        is_published: isPublished,
        updated_at: timestamp,
      })
      .eq("id", poemId)
      .eq("author_id", user.id);

    let error = updateWithFontsResult.error;
    if (isMissingPoemFontColumnsError(error)) {
      const legacyUpdateResult = await supabase
        .from("poems")
        .update({
          title,
          content_html: contentHtml,
          is_published: isPublished,
          updated_at: timestamp,
        })
        .eq("id", poemId)
        .eq("author_id", user.id);

      error = legacyUpdateResult.error;
    }

    if (error) {
      redirect(`/write?id=${poemId}&error=save_failed`);
    }
  } else {
    const insertWithFontsResult = await supabase
      .from("poems")
      .insert({
        author_id: user.id,
        title,
        content_html: contentHtml,
        title_font: titleFont,
        content_font: contentFont,
        is_published: isPublished,
      })
      .select("id")
      .single();

    let data = insertWithFontsResult.data;
    let error = insertWithFontsResult.error;
    if (isMissingPoemFontColumnsError(error)) {
      const legacyInsertResult = await supabase
        .from("poems")
        .insert({
          author_id: user.id,
          title,
          content_html: contentHtml,
          is_published: isPublished,
        })
        .select("id")
        .single();

      data = legacyInsertResult.data;
      error = legacyInsertResult.error;
    }

    if (error || !data) {
      redirect("/write?error=save_failed");
    }

  }

  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath("/search");
  revalidatePath(`/poet/${user.id}`);

  if (intent === "publish") {
    redirect("/");
  }

  redirect("/profile?tab=drafts");
}

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

  const { error } = await supabase
    .from("poems")
    .delete()
    .eq("id", poemId)
    .eq("author_id", user.id);

  if (error) {
    redirect(`/write?id=${poemId}&error=delete_failed`);
  }

  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath("/search");
  revalidatePath(`/poet/${user.id}`);
  redirect("/profile");
}

export default async function WritePage({ searchParams }: WritePageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/onboarding");
  }

  const { id, error } = await searchParams;
  const errorMessage = getErrorMessage(error);

  let poem: EditablePoem | null = null;
  if (id) {
    const foundPoemResult = await supabase
      .from("poems")
      .select("id, title, content_html, is_published, title_font, content_font")
      .eq("id", id)
      .eq("author_id", user.id)
      .maybeSingle();

    if (isMissingPoemFontColumnsError(foundPoemResult.error)) {
      const legacyFoundPoemResult = await supabase
        .from("poems")
        .select("id, title, content_html, is_published")
        .eq("id", id)
        .eq("author_id", user.id)
        .maybeSingle();

      if (legacyFoundPoemResult.error) {
        throw legacyFoundPoemResult.error;
      }

      if (!legacyFoundPoemResult.data) {
        notFound();
      }

      poem = {
        ...legacyFoundPoemResult.data,
        title_font: null,
        content_font: null,
      } as EditablePoem;
    } else {
      if (foundPoemResult.error) {
        throw foundPoemResult.error;
      }

      if (!foundPoemResult.data) {
        notFound();
      }

      poem = foundPoemResult.data as EditablePoem;
    }

    if (!poem) {
      notFound();
    }
  }

  return (
    <section className="space-y-5">
      <div className="rounded border border-ant-border bg-ant-paper-2 p-5">
        <h1 className="font-serif text-3xl text-ant-primary">{poem ? "Edit poem" : "Write a poem"}</h1>
        <p className="mt-1 text-sm text-ant-ink/80">
          Draft freely, then publish when you are ready.
        </p>
        {errorMessage ? <p className="mt-2 text-sm text-ant-primary">{errorMessage}</p> : null}
      </div>

      <PoemEditor poem={poem} savePoemAction={savePoemAction} deletePoemAction={deletePoemAction} />
    </section>
  );
}
