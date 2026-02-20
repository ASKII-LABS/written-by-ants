"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/");
}

export async function deletePoemAction(formData: FormData) {
  const poemId = String(formData.get("poem_id") ?? "").trim();

  if (!poemId) {
    return;
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
  revalidatePath("/search");
  revalidatePath(`/poet/${user.id}`);
  revalidatePath(`/write`);
}

export async function toggleLikeAction(formData: FormData) {
  const poemId = String(formData.get("poem_id") ?? "").trim();

  if (!poemId) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: poem } = await supabase
    .from("poems")
    .select("id, is_published, author_id")
    .eq("id", poemId)
    .maybeSingle();

  if (!poem || !poem.is_published) {
    return;
  }

  const { data: existingReaction } = await supabase
    .from("reactions")
    .select("poem_id")
    .eq("poem_id", poemId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingReaction) {
    await supabase
      .from("reactions")
      .delete()
      .eq("poem_id", poemId)
      .eq("user_id", user.id);
  } else {
    const { error } = await supabase
      .from("reactions")
      .insert({ poem_id: poemId, user_id: user.id });

    if (error && error.code !== "23505") {
      throw error;
    }
  }

  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath("/search");
  revalidatePath(`/poet/${poem.author_id}`);
}

export async function setLikeStateAction(formData: FormData) {
  const poemId = String(formData.get("poem_id") ?? "").trim();
  const likedField = String(formData.get("liked") ?? "").trim();
  const liked = likedField === "1" || likedField === "true";

  if (!poemId) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: poem } = await supabase
    .from("poems")
    .select("id, is_published, author_id")
    .eq("id", poemId)
    .maybeSingle();

  if (!poem || !poem.is_published) {
    return;
  }

  if (liked) {
    const { error } = await supabase
      .from("reactions")
      .insert({ poem_id: poemId, user_id: user.id });

    if (error && error.code !== "23505") {
      throw error;
    }
  } else {
    await supabase
      .from("reactions")
      .delete()
      .eq("poem_id", poemId)
      .eq("user_id", user.id);
  }

  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath("/search");
  revalidatePath(`/poet/${poem.author_id}`);
}

export type AddedComment = {
  id: string;
  poemId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
};

export async function addCommentAction(formData: FormData): Promise<AddedComment | null> {
  const poemId = String(formData.get("poem_id") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();

  if (!poemId || content.length === 0) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: poem } = await supabase
    .from("poems")
    .select("id, is_published, author_id")
    .eq("id", poemId)
    .maybeSingle();

  if (!poem || !poem.is_published) {
    return null;
  }

  const { data: insertedComment, error: insertError } = await supabase
    .from("comments")
    .insert({
      poem_id: poemId,
      author_id: user.id,
      content,
    })
    .select("id, poem_id, author_id, content, created_at")
    .single();

  if (insertError) {
    throw insertError;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const authorName = profile?.display_name ?? user.email?.split("@")[0] ?? "Poet";

  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath("/search");
  revalidatePath(`/poet/${poem.author_id}`);

  return {
    id: insertedComment.id,
    poemId: insertedComment.poem_id,
    authorId: insertedComment.author_id,
    authorName,
    content: insertedComment.content,
    createdAt: insertedComment.created_at,
  };
}
