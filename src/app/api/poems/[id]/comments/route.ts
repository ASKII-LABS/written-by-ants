import { NextResponse } from "next/server";

import { isMissingPoemFontColumnsError } from "@/lib/poem-fonts";
import { sanitizePoemHtml } from "@/lib/sanitize";
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

type PoemRecord = {
  id: string;
  title: string;
  content_html: string;
  title_font: string | null;
  content_font: string | null;
  author_id: string;
  is_published: boolean;
  created_at: string;
};

function parseLimit(rawLimit: string | null) {
  if (!rawLimit) {
    return null;
  }

  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.min(parsed, 50);
}

function parseSort(rawSort: string | null): "asc" | "desc" {
  return rawSort === "desc" ? "desc" : "asc";
}

export async function GET(request: Request, { params }: RouteContext) {
  const { id: poemId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const url = new URL(request.url);
  const sort = parseSort(url.searchParams.get("sort"));
  const cursor = url.searchParams.get("cursor")?.trim() ?? null;
  const pageLimit = parseLimit(url.searchParams.get("limit"));
  const queryLimit = pageLimit ? pageLimit + 1 : null;

  const poemResult = await supabase
    .from("poems")
    .select("id, title, content_html, title_font, content_font, author_id, is_published, created_at")
    .eq("id", poemId)
    .maybeSingle();

  let poem: PoemRecord | null = null;
  if (isMissingPoemFontColumnsError(poemResult.error)) {
    const legacyPoemResult = await supabase
      .from("poems")
      .select("id, title, content_html, author_id, is_published, created_at")
      .eq("id", poemId)
      .maybeSingle();

    if (legacyPoemResult.error) {
      return NextResponse.json(
        {
          poem: null,
          comments: [],
          commentCount: 0,
          nextCursor: null,
          viewer: {
            isSignedIn: Boolean(user),
            currentUserId: user?.id ?? null,
            currentUserName: null,
          },
        },
        { status: 500 },
      );
    }

    poem = legacyPoemResult.data
      ? ({
          ...legacyPoemResult.data,
          title_font: null,
          content_font: null,
        } as PoemRecord)
      : null;
  } else {
    if (poemResult.error) {
      return NextResponse.json(
        {
          poem: null,
          comments: [],
          commentCount: 0,
          nextCursor: null,
          viewer: {
            isSignedIn: Boolean(user),
            currentUserId: user?.id ?? null,
            currentUserName: null,
          },
        },
        { status: 500 },
      );
    }

    poem = (poemResult.data as PoemRecord | null) ?? null;
  }

  if (!poem) {
    return NextResponse.json(
      {
        poem: null,
        comments: [],
        commentCount: 0,
        nextCursor: null,
        viewer: {
          isSignedIn: Boolean(user),
          currentUserId: user?.id ?? null,
          currentUserName: null,
        },
      },
      { status: 404 },
    );
  }

  if (!poem.is_published && user?.id !== poem.author_id) {
    return NextResponse.json(
      {
        poem: null,
        comments: [],
        commentCount: 0,
        nextCursor: null,
        viewer: {
          isSignedIn: Boolean(user),
          currentUserId: user?.id ?? null,
          currentUserName: null,
        },
      },
      { status: 404 },
    );
  }

  let commentsQuery = supabase
    .from("comments")
    .select("id, author_id, content, created_at")
    .eq("poem_id", poemId)
    .order("created_at", { ascending: sort === "asc" })
    .order("id", { ascending: sort === "asc" });

  if (cursor) {
    commentsQuery =
      sort === "desc"
        ? commentsQuery.lt("created_at", cursor)
        : commentsQuery.gt("created_at", cursor);
  }

  if (queryLimit) {
    commentsQuery = commentsQuery.limit(queryLimit);
  }

  const commentsResultPromise = commentsQuery;
  const commentCountResultPromise = supabase
    .from("comments")
    .select("id", { head: true, count: "exact" })
    .eq("poem_id", poemId);
  const likeCountResultPromise = supabase
    .from("reactions")
    .select("poem_id", { head: true, count: "exact" })
    .eq("poem_id", poemId);
  const likedByViewerResultPromise = user
    ? supabase
        .from("reactions")
        .select("poem_id")
        .eq("poem_id", poemId)
        .eq("user_id", user.id)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const authorProfileResultPromise = supabase
    .from("profiles")
    .select("display_name")
    .eq("id", poem.author_id)
    .maybeSingle();
  const viewerProfileResultPromise = user
    ? supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [
    commentsResult,
    commentCountResult,
    likeCountResult,
    likedByViewerResult,
    authorProfileResult,
    viewerProfileResult,
  ] = await Promise.all([
    commentsResultPromise,
    commentCountResultPromise,
    likeCountResultPromise,
    likedByViewerResultPromise,
    authorProfileResultPromise,
    viewerProfileResultPromise,
  ]);

  const commentsTableMissing = commentsResult.error?.code === "42P01";
  if (commentsResult.error && !commentsTableMissing) {
    return NextResponse.json({ comments: [] }, { status: 500 });
  }

  if (commentCountResult.error && commentCountResult.error.code !== "42P01") {
    return NextResponse.json({ comments: [] }, { status: 500 });
  }

  if (likeCountResult.error && likeCountResult.error.code !== "42P01") {
    return NextResponse.json({ comments: [] }, { status: 500 });
  }

  if (likedByViewerResult.error && likedByViewerResult.error.code !== "42P01") {
    return NextResponse.json({ comments: [] }, { status: 500 });
  }

  const rawCommentRecords = commentsTableMissing
    ? []
    : ((commentsResult.data ?? []) as CommentRecord[]);
  const hasMoreComments = Boolean(pageLimit && rawCommentRecords.length > pageLimit);
  const commentRecords = hasMoreComments
    ? rawCommentRecords.slice(0, pageLimit ?? rawCommentRecords.length)
    : rawCommentRecords;

  const authorIds = Array.from(new Set(commentRecords.map((comment) => comment.author_id)));
  const authorNameById = new Map<string, string>();

  if (authorIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", authorIds);

    if (profilesError) {
      return NextResponse.json({ comments: [] }, { status: 500 });
    }

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

  const likeCount = likeCountResult.error ? 0 : Number(likeCountResult.count ?? 0);
  const commentCount = commentCountResult.error ? 0 : Number(commentCountResult.count ?? 0);
  const nextCursor =
    hasMoreComments && commentRecords.length > 0
      ? commentRecords[commentRecords.length - 1]?.created_at
      : null;

  const authorName = authorProfileResult.data?.display_name ?? "Unknown Poet";
  const viewerName =
    viewerProfileResult.data?.display_name ??
    user?.email?.split("@")[0] ??
    (user?.id === poem.author_id ? authorName : null);

  return NextResponse.json({
    poem: {
      id: poem.id,
      title: poem.title,
      safeContentHtml: sanitizePoemHtml(poem.content_html),
      titleFont: poem.title_font,
      contentFont: poem.content_font,
      authorId: poem.author_id,
      authorName,
      createdAt: poem.created_at,
      likeCount,
      likedByViewer: Boolean(user && likedByViewerResult.data),
    },
    viewer: {
      isSignedIn: Boolean(user),
      currentUserId: user?.id ?? null,
      currentUserName: viewerName,
    },
    comments,
    commentCount,
    nextCursor,
  });
}
