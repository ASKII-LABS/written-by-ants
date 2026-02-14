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
    .select("id, is_published")
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
  revalidatePath(`/poem/${poemId}`);
  revalidatePath("/profile");
}
