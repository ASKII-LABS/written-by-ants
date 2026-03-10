import { NextResponse } from "next/server";

import {
  cachePoemCommentsPage,
  getCachedPoemCommentsPage,
  getPoemCommentsCacheKey,
} from "@/lib/comment-cache";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_PAGE_LIMIT = 12;
const MAX_PAGE_LIMIT = 50;
const COMMENTS_CACHE_TTL_SECONDS = 90;

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
  author_id: string;
  is_published: boolean;
};

type ViewerPayload = {
  isSignedIn: boolean;
  currentUserId: string | null;
  currentUserName: string | null;
};

type CommentPayload = {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
  parentCommentId: string | null;
};

type CommentsResponsePayload = {
  poem: { id: string } | null;
  viewer: ViewerPayload;
  comments: CommentPayload[];
  commentCount: number;
  nextCursor: string | null;
};

type CompactCommentsResponsePayload = {
  p: { i: string } | null;
  v: {
    s: boolean;
    i: string | null;
    n: string | null;
  };
  c: Array<{
    i: string;
    u: string;
    n: string;
    t: string;
    d: string;
    p?: string;
  }>;
  cc: number;
  nc: string | null;
};

type Cursor = {
  createdAt: string;
  id: string | null;
};

type RpcCommentPageRecord = {
  id: string;
  author_id: string;
  author_name: string | null;
  content: string;
  created_at: string;
  parent_comment_id: string | null;
  comment_count: number | string | null;
  next_cursor_created_at: string | null;
  next_cursor_id: string | null;
};

function parseLimit(rawLimit: string | null) {
  if (!rawLimit) {
    return DEFAULT_PAGE_LIMIT;
  }

  const parsedLimit = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
    return DEFAULT_PAGE_LIMIT;
  }

  return Math.min(parsedLimit, MAX_PAGE_LIMIT);
}

function parseSort(rawSort: string | null): "asc" | "desc" {
  return rawSort === "desc" ? "desc" : "asc";
}

function parseCompact(rawCompact: string | null) {
  return rawCompact === "1" || rawCompact === "true";
}

function encodeCursor(createdAt: string, id: string) {
  return Buffer.from(JSON.stringify({ createdAt, id }), "utf8").toString("base64url");
}

function parseCursor(rawCursor: string | null): Cursor | null {
  if (!rawCursor) {
    return null;
  }

  try {
    const decodedJson = Buffer.from(rawCursor, "base64url").toString("utf8");
    const parsed = JSON.parse(decodedJson) as Partial<Cursor>;
    if (
      typeof parsed.createdAt === "string" &&
      parsed.createdAt.length > 0 &&
      (typeof parsed.id === "string" || parsed.id === null || typeof parsed.id === "undefined")
    ) {
      return {
        createdAt: parsed.createdAt,
        id: typeof parsed.id === "string" && parsed.id.length > 0 ? parsed.id : null,
      };
    }
  } catch {
    return {
      createdAt: rawCursor,
      id: null,
    };
  }

  return null;
}

function getErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function withCursorFilter<T>(query: T, sort: "asc" | "desc", cursor: Cursor | null) {
  if (!cursor) {
    return query;
  }

  if (!cursor.id) {
    return sort === "desc"
      ? (query as { lt: (column: string, value: string) => T }).lt("created_at", cursor.createdAt)
      : (query as { gt: (column: string, value: string) => T }).gt("created_at", cursor.createdAt);
  }

  const createdAtOp = sort === "desc" ? "lt" : "gt";
  const idOp = sort === "desc" ? "lt" : "gt";
  const compositeCursorFilter = [
    `created_at.${createdAtOp}.${cursor.createdAt}`,
    `and(created_at.eq.${cursor.createdAt},id.${idOp}.${cursor.id})`,
  ].join(",");

  return (query as { or: (filters: string) => T }).or(compositeCursorFilter);
}

async function resolveViewer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { id: string; email?: string | null } | null,
): Promise<ViewerPayload> {
  if (!user) {
    return {
      isSignedIn: false,
      currentUserId: null,
      currentUserName: null,
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  return {
    isSignedIn: true,
    currentUserId: user.id,
    currentUserName: profile?.display_name ?? user.email?.split("@")[0] ?? null,
  };
}

function createEmptyPayload(viewer: ViewerPayload): CommentsResponsePayload {
  return {
    poem: null,
    viewer,
    comments: [],
    commentCount: 0,
    nextCursor: null,
  };
}

function toCompactPayload(payload: CommentsResponsePayload): CompactCommentsResponsePayload {
  return {
    p: payload.poem ? { i: payload.poem.id } : null,
    v: {
      s: payload.viewer.isSignedIn,
      i: payload.viewer.currentUserId,
      n: payload.viewer.currentUserName,
    },
    c: payload.comments.map((comment) => ({
      i: comment.id,
      u: comment.authorId,
      n: comment.authorName,
      t: comment.content,
      d: comment.createdAt,
      ...(comment.parentCommentId ? { p: comment.parentCommentId } : {}),
    })),
    cc: payload.commentCount,
    nc: payload.nextCursor,
  };
}

function responseJson(
  payload: CommentsResponsePayload,
  {
    compact,
    status,
    source,
  }: {
    compact: boolean;
    status?: number;
    source?: "cache" | "rpc" | "legacy" | "error";
  },
) {
  const response = NextResponse.json(compact ? toCompactPayload(payload) : payload, {
    ...(typeof status === "number" ? { status } : {}),
  });
  if (source) {
    response.headers.set("x-comments-source", source);
  }

  return response;
}

export async function GET(request: Request, { params }: RouteContext) {
  const { id: poemId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const url = new URL(request.url);
  const compact = parseCompact(url.searchParams.get("compact"));
  const sort = parseSort(url.searchParams.get("sort"));
  const pageLimit = parseLimit(url.searchParams.get("limit"));
  const cursor = parseCursor(url.searchParams.get("cursor")?.trim() ?? null);
  const queryLimit = pageLimit + 1;
  const shouldFetchCount = !cursor;
  const shouldUseCache = shouldFetchCount;
  const cacheKey = shouldUseCache
    ? getPoemCommentsCacheKey({
        poemId,
        sort,
        limit: pageLimit,
      })
    : null;

  const viewerPromise = resolveViewer(supabase, user);

  if (cacheKey) {
    const cachedPage = await getCachedPoemCommentsPage(cacheKey);
    if (cachedPage) {
      const cachedPoemResult = await supabase
        .from("poems")
        .select("id, author_id, is_published")
        .eq("id", poemId)
        .maybeSingle();

      if (cachedPoemResult.error) {
        const viewer = await viewerPromise;
        return responseJson(createEmptyPayload(viewer), {
          compact,
          status: 500,
          source: "error",
        });
      }

      const cachedPoem = (cachedPoemResult.data as PoemRecord | null) ?? null;
      if (!cachedPoem || (!cachedPoem.is_published && cachedPoem.author_id !== user?.id)) {
        const viewer = await viewerPromise;
        return responseJson(createEmptyPayload(viewer), {
          compact,
          status: 404,
          source: "error",
        });
      }

      const viewer = await viewerPromise;
      return responseJson(
        {
          poem: { id: cachedPoem.id },
          viewer,
          comments: cachedPage.comments,
          commentCount: cachedPage.commentCount,
          nextCursor: cachedPage.nextCursor,
        },
        { compact, source: "cache" },
      );
    }
  }

  const poemResult = await supabase
    .from("poems")
    .select("id, author_id, is_published")
    .eq("id", poemId)
    .maybeSingle();

  if (poemResult.error) {
    const viewer = await viewerPromise;
    return responseJson(createEmptyPayload(viewer), { compact, status: 500, source: "error" });
  }

  const poem = (poemResult.data as PoemRecord | null) ?? null;

  if (!poem || (!poem.is_published && user?.id !== poem.author_id)) {
    const viewer = await viewerPromise;
    return responseJson(createEmptyPayload(viewer), { compact, status: 404, source: "error" });
  }

  const rpcCommentsPageResult = await supabase.rpc("fetch_poem_comments_page", {
    target_poem_id: poemId,
    page_limit: pageLimit,
    page_sort: sort,
    cursor_created_at: cursor?.createdAt ?? null,
    cursor_id: cursor?.id ?? null,
    include_count: shouldFetchCount,
  });
  const rpcErrorCode = getErrorCode(rpcCommentsPageResult.error);
  const rpcFunctionMissing = rpcErrorCode === "42883" || rpcErrorCode === "PGRST202";

  if (rpcCommentsPageResult.error && !rpcFunctionMissing && rpcErrorCode !== "42P01") {
    const viewer = await viewerPromise;
    return responseJson(createEmptyPayload(viewer), { compact, status: 500, source: "error" });
  }

  if (!rpcCommentsPageResult.error) {
    const rpcRows = (rpcCommentsPageResult.data ?? []) as RpcCommentPageRecord[];
    const comments: CommentPayload[] = rpcRows.map((row) => ({
      id: row.id,
      authorId: row.author_id,
      authorName: row.author_name ?? "Poet",
      content: row.content,
      createdAt: row.created_at,
      parentCommentId: row.parent_comment_id,
    }));

    const nextCursorCreatedAt = rpcRows[0]?.next_cursor_created_at ?? null;
    const nextCursorId = rpcRows[0]?.next_cursor_id ?? null;
    const nextCursor =
      nextCursorCreatedAt && nextCursorId
        ? encodeCursor(nextCursorCreatedAt, nextCursorId)
        : null;
    const commentCount = shouldFetchCount ? Number(rpcRows[0]?.comment_count ?? 0) : 0;

    const payload: CommentsResponsePayload = {
      poem: { id: poem.id },
      viewer: await viewerPromise,
      comments,
      commentCount,
      nextCursor,
    };

    if (cacheKey && poem.is_published) {
      void cachePoemCommentsPage({
        poemId,
        cacheKey,
        ttlSeconds: COMMENTS_CACHE_TTL_SECONDS,
        value: {
          poem: {
            id: poem.id,
            authorId: poem.author_id,
            isPublished: poem.is_published,
          },
          comments,
          commentCount,
          nextCursor,
        },
      });
    }

    return responseJson(payload, { compact, source: "rpc" });
  }

  let rootCommentsQuery = supabase
    .from("comments")
    .select("id, author_id, content, created_at, parent_comment_id")
    .eq("poem_id", poemId)
    .is("parent_comment_id", null)
    .order("created_at", { ascending: sort === "asc" })
    .order("id", { ascending: sort === "asc" });

  rootCommentsQuery = withCursorFilter(rootCommentsQuery, sort, cursor);
  rootCommentsQuery = rootCommentsQuery.limit(queryLimit);

  const rootCommentsResultPromise = rootCommentsQuery;
  const commentCountResultPromise = shouldFetchCount
    ? supabase.from("comments").select("id", { head: true, count: "exact" }).eq("poem_id", poemId)
    : Promise.resolve({ count: null, error: null });

  const [rootCommentsResult, commentCountResult] = await Promise.all([
    rootCommentsResultPromise,
    commentCountResultPromise,
  ]);

  const commentsTableMissing = getErrorCode(rootCommentsResult.error) === "42P01";
  if (rootCommentsResult.error && !commentsTableMissing) {
    const viewer = await viewerPromise;
    return responseJson(createEmptyPayload(viewer), { compact, status: 500, source: "error" });
  }

  if (shouldFetchCount && commentCountResult.error && getErrorCode(commentCountResult.error) !== "42P01") {
    const viewer = await viewerPromise;
    return responseJson(createEmptyPayload(viewer), { compact, status: 500, source: "error" });
  }

  const rawRootCommentRecords = commentsTableMissing
    ? []
    : ((rootCommentsResult.data ?? []) as CommentRecord[]);
  const hasMoreComments = rawRootCommentRecords.length > pageLimit;
  const rootCommentRecords = hasMoreComments
    ? rawRootCommentRecords.slice(0, pageLimit)
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

      if (repliesResult.error && getErrorCode(repliesResult.error) !== "42P01") {
        const viewer = await viewerPromise;
        return responseJson(createEmptyPayload(viewer), {
          compact,
          status: 500,
          source: "error",
        });
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
      const viewer = await viewerPromise;
      return responseJson(createEmptyPayload(viewer), { compact, status: 500, source: "error" });
    }

    (profiles ?? []).forEach((profile) => {
      authorNameById.set(profile.id, profile.display_name ?? "Poet");
    });
  }

  const comments: CommentPayload[] = commentRecords.map((comment) => ({
    id: comment.id,
    authorId: comment.author_id,
    authorName: authorNameById.get(comment.author_id) ?? "Poet",
    content: comment.content,
    createdAt: comment.created_at,
    parentCommentId: comment.parent_comment_id,
  }));

  const commentCount = shouldFetchCount ? Number(commentCountResult.count ?? 0) : 0;
  const lastRootComment = rootCommentRecords[rootCommentRecords.length - 1];
  const nextCursor =
    hasMoreComments && lastRootComment
      ? encodeCursor(lastRootComment.created_at, lastRootComment.id)
      : null;

  const payload: CommentsResponsePayload = {
    poem: { id: poem.id },
    viewer: await viewerPromise,
    comments,
    commentCount,
    nextCursor,
  };

  if (cacheKey && poem.is_published) {
    void cachePoemCommentsPage({
      poemId,
      cacheKey,
      ttlSeconds: COMMENTS_CACHE_TTL_SECONDS,
      value: {
        poem: {
          id: poem.id,
          authorId: poem.author_id,
          isPublished: poem.is_published,
        },
        comments,
        commentCount,
        nextCursor,
      },
    });
  }

  return responseJson(payload, { compact, source: "legacy" });
}
