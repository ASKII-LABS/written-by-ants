import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type CommentRecord = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { id: poemId } = await params;
  const supabase = await createClient();

  const commentsResult = await supabase
    .from("comments")
    .select("id, author_id, content, created_at")
    .eq("poem_id", poemId)
    .order("created_at", { ascending: true });

  if (commentsResult.error) {
    if (commentsResult.error.code === "42P01") {
      return NextResponse.json({ comments: [] });
    }

    return NextResponse.json({ comments: [] }, { status: 500 });
  }

  const commentRecords = (commentsResult.data ?? []) as CommentRecord[];
  const authorIds = Array.from(new Set(commentRecords.map((comment) => comment.author_id)));
  const authorNameById = new Map<string, string>();

  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", authorIds);

    (profiles ?? []).forEach((profile) => {
      authorNameById.set(profile.id, profile.display_name ?? "Poet");
    });
  }

  const comments = commentRecords.map((comment) => ({
    id: comment.id,
    authorId: comment.author_id,
    authorName: authorNameById.get(comment.author_id) ?? "Poet",
    content: comment.content,
    createdAt: comment.created_at,
  }));

  return NextResponse.json({ comments });
}
