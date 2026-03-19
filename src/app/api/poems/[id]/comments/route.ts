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
  likeCount: number;
  likedByViewer: boolean;
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
    l: number;
    y: boolean;
  }>;
  cc: number;
  nc: string | null;
};

type Cursor = {
  createdAt: string;
  id: string | null;
};

type DrawerRpcCommentPageRecord = {
  id: string;
  author_id: string;
  author_name: string | null;
  content: string;
  created_at: string;
  parent_comment_id: string | null;
  like_count: number | string | null;
  liked_by_viewer: boolean | null;
  comment_count: number | string | null;
  next_cursor_created_at: string | null;
  next_cursor_id: string | null;
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

type CommentReactionRow = {
  comment_id: string;
  user_id: string;
};

type CommentsSource = "cache" | "drawer-rpc" | "rpc" | "legacy" | "error";
type CommentsFetchStrategy = "drawer-rpc" | "rpc" | "legacy";

type CommentsFetchParams = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  poemId: string;
  pageLimit: number;
  sort: "asc" | "desc";
  cursor: Cursor | null;
  shouldFetchCount: boolean;
  viewerUserId: string | null;
};

type CommentsFetchResult = {
  comments: CommentPayload[];
  commentCount: number;
  nextCursor: string | null;
  source: Exclude<CommentsSource, "cache" | "error">;
};

let preferredCommentsFetchStrategy: CommentsFetchStrategy = "drawer-rpc";

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

function resolveViewer(user: { id: string; email?: string | null } | null): ViewerPayload {
  if (!user) {
    return {
      isSignedIn: false,
      currentUserId: null,
      currentUserName: null,
    };
  }

  return {
    isSignedIn: true,
    currentUserId: user.id,
    currentUserName: user.email?.split("@")[0] ?? null,
  };
}

async function getViewerLikedCommentIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  commentIds: string[],
  viewerUserId: string | null,
) {
  if (!viewerUserId || commentIds.length === 0) {
    return new Set<string>();
  }

  const { data, error } = await supabase
    .from("comment_reactions")
    .select("comment_id")
    .eq("user_id", viewerUserId)
    .in("comment_id", commentIds);

  if (error) {
    const errorCode = getErrorCode(error);
    if (errorCode !== "42P01") {
      throw error;
    }

    return new Set<string>();
  }

  return new Set(
    ((data ?? []) as Array<{ comment_id: string }>).map((reaction) => reaction.comment_id),
  );
}

function withViewerLikeState(comments: CommentPayload[], likedCommentIds: Set<string>) {
  if (comments.length === 0) {
    return comments;
  }

  return comments.map((comment) => ({
    ...comment,
    likedByViewer: likedCommentIds.has(comment.id),
  }));
}

async function withCommentLikeState(
  supabase: Awaited<ReturnType<typeof createClient>>,
  comments: Omit<CommentPayload, "likeCount" | "likedByViewer">[],
  viewerUserId: string | null,
): Promise<CommentPayload[]> {
  if (comments.length === 0) {
    return [];
  }

  const commentIds = Array.from(new Set(comments.map((comment) => comment.id)));
  const { data: reactions, error: reactionsError } = await supabase
    .from("comment_reactions")
    .select("comment_id, user_id")
    .in("comment_id", commentIds);

  if (reactionsError) {
    const errorCode = getErrorCode(reactionsError);
    if (errorCode !== "42P01") {
      throw reactionsError;
    }

    return comments.map((comment) => ({
      ...comment,
      likeCount: 0,
      likedByViewer: false,
    }));
  }

  const likeCountByCommentId = new Map<string, number>();
  const likedCommentIdsByViewer = new Set<string>();
  ((reactions ?? []) as CommentReactionRow[]).forEach((reaction) => {
    likeCountByCommentId.set(
      reaction.comment_id,
      (likeCountByCommentId.get(reaction.comment_id) ?? 0) + 1,
    );

    if (viewerUserId && reaction.user_id === viewerUserId) {
      likedCommentIdsByViewer.add(reaction.comment_id);
    }
  });

  return comments.map((comment) => ({
    ...comment,
    likeCount: likeCountByCommentId.get(comment.id) ?? 0,
    likedByViewer: viewerUserId ? likedCommentIdsByViewer.has(comment.id) : false,
  }));
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
      l: comment.likeCount,
      y: comment.likedByViewer,
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
    totalMs,
  }: {
    compact: boolean;
    status?: number;
    source?: CommentsSource;
    totalMs: number;
  },
) {
  const response = NextResponse.json(compact ? toCompactPayload(payload) : payload, {
    ...(typeof status === "number" ? { status } : {}),
  });

  if (source) {
    response.headers.set("x-comments-source", source);
  }

  response.headers.set("x-comments-total-ms", totalMs.toFixed(1));
  response.headers.set("server-timing", `comments;dur=${totalMs.toFixed(1)}`);
  return response;
}

function toCacheableComments(comments: CommentPayload[]) {
  return comments.map((comment) => ({
    ...comment,
    likedByViewer: false,
  }));
}

function toPayloadFromCacheComments(
  comments: CachedCommentPayload[],
): CommentPayload[] {
  return comments.map((comment) => ({
    ...comment,
    likeCount: comment.likeCount ?? 0,
    likedByViewer: false,
  }));
}

type CachedCommentPayload = Awaited<
  ReturnType<typeof getCachedPoemCommentsPage>
> extends infer T
  ? T extends { comments: infer U }
    ? U extends CommentPayload[]
      ? U[number]
      : never
    : never
  : never;

function getNextCursorFromDrawerRows(rows: DrawerRpcCommentPageRecord[]) {
  const nextCursorCreatedAt = rows[0]?.next_cursor_created_at ?? null;
  const nextCursorId = rows[0]?.next_cursor_id ?? null;
  return nextCursorCreatedAt && nextCursorId
    ? encodeCursor(nextCursorCreatedAt, nextCursorId)
    : null;
}

function getNextCursorFromRpcRows(rows: RpcCommentPageRecord[]) {
  const nextCursorCreatedAt = rows[0]?.next_cursor_created_at ?? null;
  const nextCursorId = rows[0]?.next_cursor_id ?? null;
  return nextCursorCreatedAt && nextCursorId
    ? encodeCursor(nextCursorCreatedAt, nextCursorId)
    : null;
}

async function fetchCommentsWithDrawerRpc({
  supabase,
  poemId,
  pageLimit,
  sort,
  cursor,
  shouldFetchCount,
}: Omit<CommentsFetchParams, "viewerUserId">): Promise<CommentsFetchResult | null> {
  console.time("drawer-rpc");
  try {
    const result = await supabase.rpc("fetch_poem_comments_drawer_page", {
      target_poem_id: poemId,
      page_limit: pageLimit,
      page_sort: sort,
      cursor_created_at: cursor?.createdAt ?? null,
      cursor_id: cursor?.id ?? null,
      include_count: shouldFetchCount,
    });

    const errorCode = getErrorCode(result.error);
    const functionMissing = errorCode === "42883" || errorCode === "PGRST202";
    if (result.error) {
      if (functionMissing || errorCode === "42P01") {
        return null;
      }

      throw result.error;
    }

    const rows = (result.data ?? []) as DrawerRpcCommentPageRecord[];
    return {
      comments: rows.map((row) => ({
        id: row.id,
        authorId: row.author_id,
        authorName: row.author_name ?? "Poet",
        content: row.content,
        createdAt: row.created_at,
        parentCommentId: row.parent_comment_id,
        likeCount: Number(row.like_count ?? 0),
        likedByViewer: Boolean(row.liked_by_viewer),
      })),
      commentCount: shouldFetchCount ? Number(rows[0]?.comment_count ?? 0) : 0,
      nextCursor: getNextCursorFromDrawerRows(rows),
      source: "drawer-rpc",
    };
  } finally {
    console.timeEnd("drawer-rpc");
  }
}

async function fetchCommentsWithRpc({
  supabase,
  poemId,
  pageLimit,
  sort,
  cursor,
  shouldFetchCount,
  viewerUserId,
}: CommentsFetchParams): Promise<CommentsFetchResult | null> {
  console.time("rpc");
  try {
    const result = await supabase.rpc("fetch_poem_comments_page", {
      target_poem_id: poemId,
      page_limit: pageLimit,
      page_sort: sort,
      cursor_created_at: cursor?.createdAt ?? null,
      cursor_id: cursor?.id ?? null,
      include_count: shouldFetchCount,
    });

    const errorCode = getErrorCode(result.error);
    const functionMissing = errorCode === "42883" || errorCode === "PGRST202";
    if (result.error) {
      if (functionMissing || errorCode === "42P01") {
        return null;
      }

      throw result.error;
    }

    console.time("rpc-map");
    const rows = (result.data ?? []) as RpcCommentPageRecord[];
    const baseComments = rows.map((row) => ({
      id: row.id,
      authorId: row.author_id,
      authorName: row.author_name ?? "Poet",
      content: row.content,
      createdAt: row.created_at,
      parentCommentId: row.parent_comment_id,
    }));
    console.timeEnd("rpc-map");

    console.time("rpc-likes");
    try {
      return {
        comments: await withCommentLikeState(supabase, baseComments, viewerUserId),
        commentCount: shouldFetchCount ? Number(rows[0]?.comment_count ?? 0) : 0,
        nextCursor: getNextCursorFromRpcRows(rows),
        source: "rpc",
      };
    } finally {
      console.timeEnd("rpc-likes");
    }
  } finally {
    console.timeEnd("rpc");
  }
}

async function fetchCommentsWithLegacy({
  supabase,
  poemId,
  pageLimit,
  sort,
  cursor,
  shouldFetchCount,
  viewerUserId,
}: CommentsFetchParams): Promise<CommentsFetchResult> {
  const queryLimit = pageLimit + 1;

  console.time("legacy-root-query");
  let rootCommentsQuery = supabase
    .from("comments")
    .select("id, author_id, content, created_at, parent_comment_id")
    .eq("poem_id", poemId)
    .is("parent_comment_id", null)
    .order("created_at", { ascending: sort === "asc" })
    .order("id", { ascending: sort === "asc" });
  console.timeEnd("legacy-root-query");

  rootCommentsQuery = withCursorFilter(rootCommentsQuery, sort, cursor);
  rootCommentsQuery = rootCommentsQuery.limit(queryLimit);

  const commentCountResultPromise = shouldFetchCount
    ? supabase.from("comments").select("id", { head: true, count: "exact" }).eq("poem_id", poemId)
    : Promise.resolve({ count: null, error: null });

  console.time("legacy-root-and-count");
  const [rootCommentsResult, commentCountResult] = await Promise.all([
    rootCommentsQuery,
    commentCountResultPromise,
  ]);
  console.timeEnd("legacy-root-and-count");

  const commentsTableMissing = getErrorCode(rootCommentsResult.error) === "42P01";
  if (rootCommentsResult.error && !commentsTableMissing) {
    throw rootCommentsResult.error;
  }

  if (shouldFetchCount && commentCountResult.error && getErrorCode(commentCountResult.error) !== "42P01") {
    throw commentCountResult.error;
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

    console.time("legacy-descendants");
    try {
      while (parentIdsToLoad.length > 0) {
        const repliesResult = await supabase
          .from("comments")
          .select("id, author_id, content, created_at, parent_comment_id")
          .eq("poem_id", poemId)
          .in("parent_comment_id", parentIdsToLoad)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true });

        if (repliesResult.error && getErrorCode(repliesResult.error) !== "42P01") {
          throw repliesResult.error;
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
    } finally {
      console.timeEnd("legacy-descendants");
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
    console.time("legacy-profiles");
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", authorIds);

      if (profilesError) {
        throw profilesError;
      }

      (profiles ?? []).forEach((profile) => {
        authorNameById.set(profile.id, profile.display_name ?? "Poet");
      });
    } finally {
      console.timeEnd("legacy-profiles");
    }
  }

  const baseComments = commentRecords.map((comment) => ({
    id: comment.id,
    authorId: comment.author_id,
    authorName: authorNameById.get(comment.author_id) ?? "Poet",
    content: comment.content,
    createdAt: comment.created_at,
    parentCommentId: comment.parent_comment_id,
  }));

  console.time("legacy-likes");
  try {
    return {
      comments: await withCommentLikeState(supabase, baseComments, viewerUserId),
      commentCount: shouldFetchCount ? Number(commentCountResult.count ?? 0) : 0,
      nextCursor:
        hasMoreComments && rootCommentRecords[rootCommentRecords.length - 1]
          ? encodeCursor(
              rootCommentRecords[rootCommentRecords.length - 1]!.created_at,
              rootCommentRecords[rootCommentRecords.length - 1]!.id,
            )
          : null,
      source: "legacy",
    };
  } finally {
    console.timeEnd("legacy-likes");
  }
}

async function fetchCommentsWithBestStrategy(params: CommentsFetchParams): Promise<CommentsFetchResult> {
  if (preferredCommentsFetchStrategy === "drawer-rpc") {
    const drawerRpcResult = await fetchCommentsWithDrawerRpc(params);
    if (drawerRpcResult) {
      return drawerRpcResult;
    }

    preferredCommentsFetchStrategy = "rpc";
  }

  if (preferredCommentsFetchStrategy === "rpc") {
    const rpcResult = await fetchCommentsWithRpc(params);
    if (rpcResult) {
      return rpcResult;
    }

    preferredCommentsFetchStrategy = "legacy";
  }

  return fetchCommentsWithLegacy(params);
}

export async function GET(request: Request, { params }: RouteContext) {
  const startedAt = performance.now();
  console.time("comments-total");

  const { id: poemId } = await params;

  console.time("createClient");
  const supabase = await createClient();
  console.timeEnd("createClient");

  console.time("getUser");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  console.timeEnd("getUser");

  const viewer = resolveViewer(user);
  const url = new URL(request.url);
  const compact = parseCompact(url.searchParams.get("compact"));
  const sort = parseSort(url.searchParams.get("sort"));
  const pageLimit = parseLimit(url.searchParams.get("limit"));
  const cursor = parseCursor(url.searchParams.get("cursor")?.trim() ?? null);
  const shouldFetchCount = !cursor;
  const cacheKey = shouldFetchCount
    ? getPoemCommentsCacheKey({
        poemId,
        sort,
        limit: pageLimit,
      })
    : null;

  const respond = (
    payload: CommentsResponsePayload,
    {
      status,
      source,
    }: {
      status?: number;
      source?: CommentsSource;
    },
  ) => {
    console.timeEnd("comments-total");
    return responseJson(payload, {
      compact,
      status,
      source,
      totalMs: performance.now() - startedAt,
    });
  };

  if (cacheKey) {
    console.time("cache-get");
    const cachedPage = await getCachedPoemCommentsPage(cacheKey);
    console.timeEnd("cache-get");

    if (cachedPage) {
      let comments = toPayloadFromCacheComments(cachedPage.comments);

      if (viewer.currentUserId && comments.length > 0) {
        console.time("cache-viewer-likes");
        try {
          const likedCommentIds = await getViewerLikedCommentIds(
            supabase,
            comments.map((comment) => comment.id),
            viewer.currentUserId,
          );
          comments = withViewerLikeState(comments, likedCommentIds);
        } catch {
          return respond(createEmptyPayload(viewer), {
            status: 500,
            source: "error",
          });
        } finally {
          console.timeEnd("cache-viewer-likes");
        }
      }

      return respond(
        {
          poem: { id: cachedPage.poem.id },
          viewer,
          comments,
          commentCount: cachedPage.commentCount,
          nextCursor: cachedPage.nextCursor,
        },
        { source: "cache" },
      );
    }
  }

  const poemResultPromise = (async () => {
    console.time("poem");
    try {
      return await supabase
        .from("poems")
        .select("id, author_id, is_published")
        .eq("id", poemId)
        .maybeSingle();
    } finally {
      console.timeEnd("poem");
    }
  })();

  let poemResult: Awaited<typeof poemResultPromise>;
  let commentsResult: CommentsFetchResult;

  try {
    [poemResult, commentsResult] = await Promise.all([
      poemResultPromise,
      fetchCommentsWithBestStrategy({
        supabase,
        poemId,
        pageLimit,
        sort,
        cursor,
        shouldFetchCount,
        viewerUserId: viewer.currentUserId,
      }),
    ]);
  } catch {
    return respond(createEmptyPayload(viewer), {
      status: 500,
      source: "error",
    });
  }

  if (poemResult.error) {
    return respond(createEmptyPayload(viewer), {
      status: 500,
      source: "error",
    });
  }

  const poem = (poemResult.data as PoemRecord | null) ?? null;
  if (!poem || (!poem.is_published && user?.id !== poem.author_id)) {
    return respond(createEmptyPayload(viewer), {
      status: 404,
      source: "error",
    });
  }

  const payload: CommentsResponsePayload = {
    poem: { id: poem.id },
    viewer,
    comments: commentsResult.comments,
    commentCount: commentsResult.commentCount,
    nextCursor: commentsResult.nextCursor,
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
        comments: toCacheableComments(commentsResult.comments),
        commentCount: commentsResult.commentCount,
        nextCursor: commentsResult.nextCursor,
      },
    });
  }

  return respond(payload, { source: commentsResult.source });
}
