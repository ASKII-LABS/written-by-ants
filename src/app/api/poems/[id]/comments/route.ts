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
  parent_comment_id: string | null;
};

type PoemRecord = {
  id: string;
  title: string;
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
  const shouldFetchCount = !cursor;

  const poemResult = await supabase
    .from("poems")
    .select("id, title, author_id, is_published, created_at")
    .eq("id", poemId)
    .maybeSingle();

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

  const poem = (poemResult.data as PoemRecord | null) ?? null;

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

  let rootCommentsQuery = supabase
    .from("comments")
    .select("id, author_id, content, created_at, parent_comment_id")
    .eq("poem_id", poemId)
    .is("parent_comment_id", null)
    .order("created_at", { ascending: sort === "asc" })
    .order("id", { ascending: sort === "asc" });

  if (cursor) {
    rootCommentsQuery =
      sort === "desc"
        ? rootCommentsQuery.lt("created_at", cursor)
        : rootCommentsQuery.gt("created_at", cursor);
  }

  if (queryLimit) {
    rootCommentsQuery = rootCommentsQuery.limit(queryLimit);
  }

  const rootCommentsResultPromise = rootCommentsQuery;
  const commentCountResultPromise = shouldFetchCount
    ? supabase.from("comments").select("id", { head: true, count: "exact" }).eq("poem_id", poemId)
    : Promise.resolve({ count: null, error: null });
  const viewerProfileResultPromise = user
    ? supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [rootCommentsResult, commentCountResult, viewerProfileResult] = await Promise.all([
    rootCommentsResultPromise,
    commentCountResultPromise,
    viewerProfileResultPromise,
  ]);

  const commentsTableMissing = rootCommentsResult.error?.code === "42P01";
  if (rootCommentsResult.error && !commentsTableMissing) {
    return NextResponse.json({ comments: [] }, { status: 500 });
  }

  if (
    shouldFetchCount &&
    commentCountResult.error &&
    "code" in commentCountResult.error &&
    commentCountResult.error.code !== "42P01"
  ) {
    return NextResponse.json({ comments: [] }, { status: 500 });
  }

  const rawRootCommentRecords = commentsTableMissing
    ? []
    : ((rootCommentsResult.data ?? []) as CommentRecord[]);
  const hasMoreComments = Boolean(pageLimit && rawRootCommentRecords.length > pageLimit);
  const rootCommentRecords = hasMoreComments
    ? rawRootCommentRecords.slice(0, pageLimit ?? rawRootCommentRecords.length)
    : rawRootCommentRecords;
  const rootCommentIds = rootCommentRecords.map((comment) => comment.id);

  const descendantRecords: CommentRecord[] = [];
  if (!commentsTableMissing && rootCommentIds.length > 0) {
    const seenCommentIds = new Set<string>();
    let parentIdsToLoad = rootCommentIds;

    while (parentIdsToLoad.length > 0) {
      const repliesResult = await supabase
        .from("comments")
        .select("id, author_id, content, created_at, parent_comment_id")
        .eq("poem_id", poemId)
        .in("parent_comment_id", parentIdsToLoad)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });

      if (repliesResult.error && repliesResult.error.code !== "42P01") {
        return NextResponse.json({ comments: [] }, { status: 500 });
      }

      const currentLevelReplies = (repliesResult.data ?? []) as CommentRecord[];
      if (currentLevelReplies.length === 0) {
        break;
      }

      descendantRecords.push(...currentLevelReplies);
      const nextParentIds: string[] = [];
      currentLevelReplies.forEach((reply) => {
        if (seenCommentIds.has(reply.id)) {
          return;
        }

        seenCommentIds.add(reply.id);
        nextParentIds.push(reply.id);
      });

      parentIdsToLoad = nextParentIds;
    }
  }

  const repliesByParent = new Map<string, CommentRecord[]>();
  descendantRecords.forEach((reply) => {
    if (!reply.parent_comment_id) {
      return;
    }

    const existingReplies = repliesByParent.get(reply.parent_comment_id) ?? [];
    existingReplies.push(reply);
    repliesByParent.set(reply.parent_comment_id, existingReplies);
  });

  const commentRecords: CommentRecord[] = [];
  const visitedCommentIds = new Set<string>();
  const appendThread = (comment: CommentRecord) => {
    if (visitedCommentIds.has(comment.id)) {
      return;
    }

    visitedCommentIds.add(comment.id);
    commentRecords.push(comment);
    (repliesByParent.get(comment.id) ?? []).forEach((reply) => appendThread(reply));
  };

  rootCommentRecords.forEach((rootComment) => appendThread(rootComment));

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
    parentCommentId: comment.parent_comment_id,
  }));

  const commentCount = shouldFetchCount ? Number(commentCountResult.count ?? 0) : 0;
  const nextCursor =
    hasMoreComments && rootCommentRecords.length > 0
      ? rootCommentRecords[rootCommentRecords.length - 1]?.created_at
      : null;

  const viewerName = viewerProfileResult.data?.display_name ?? user?.email?.split("@")[0] ?? null;

  return NextResponse.json({
    poem: {
      id: poem.id,
      title: poem.title,
      safeContentHtml: "",
      titleFont: null,
      contentFont: null,
      authorId: poem.author_id,
      authorName: "Poet",
      createdAt: poem.created_at,
      likeCount: 0,
      likedByViewer: false,
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
