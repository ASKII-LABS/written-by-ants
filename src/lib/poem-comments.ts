export const COMMENT_PAGE_SIZE = 12;

export type DrawerPoem = {
  id: string;
};

export type DrawerViewer = {
  isSignedIn: boolean;
  currentUserId: string | null;
  currentUserName: string | null;
};

export type DrawerComment = {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
  parentCommentId: string | null;
  likeCount: number;
  likedByViewer: boolean;
  isPending?: boolean;
};

export type PoemCommentsResponse = {
  poem: DrawerPoem | null;
  viewer: DrawerViewer;
  comments: DrawerComment[];
  commentCount: number;
  nextCursor: string | null;
};

type PoemCommentsQuery = {
  limit?: number;
  cursor?: string | null;
  sort?: "asc" | "desc";
  compact?: boolean;
};

const DEFAULT_VIEWER: DrawerViewer = {
  isSignedIn: false,
  currentUserId: null,
  currentUserName: null,
};

export function getPoemCommentsUrl(poemId: string, query: PoemCommentsQuery = {}) {
  const params = new URLSearchParams();

  if (query.limit && query.limit > 0) {
    params.set("limit", String(query.limit));
  }

  if (query.cursor) {
    params.set("cursor", query.cursor);
  }

  if (query.sort) {
    params.set("sort", query.sort);
  }

  if (query.compact !== false) {
    params.set("compact", "1");
  }

  const suffix = params.toString();
  return suffix.length > 0
    ? `/api/poems/${poemId}/comments?${suffix}`
    : `/api/poems/${poemId}/comments`;
}

type CompactComment = {
  i: string;
  u: string;
  n: string;
  t: string;
  d: string;
  p?: string | null;
  l?: number;
  y?: boolean;
};

type CompactViewer = {
  s: boolean;
  i: string | null;
  n: string | null;
};

type CompactPoemCommentsResponse = {
  p?: { i: string } | null;
  v?: CompactViewer;
  c?: CompactComment[];
  cc?: number;
  nc?: string | null;
};

function parseCompactPayload(payload: CompactPoemCommentsResponse): PoemCommentsResponse {
  const compactComments = payload.c ?? [];
  return {
    poem: payload.p ? { id: payload.p.i } : null,
    viewer: payload.v
      ? {
          isSignedIn: Boolean(payload.v.s),
          currentUserId: payload.v.i ?? null,
          currentUserName: payload.v.n ?? null,
        }
      : DEFAULT_VIEWER,
    comments: compactComments.map((comment) => ({
      id: comment.i,
      authorId: comment.u,
      authorName: comment.n,
      content: comment.t,
      createdAt: comment.d,
      parentCommentId: comment.p ?? null,
      likeCount: comment.l ?? 0,
      likedByViewer: Boolean(comment.y),
    })),
    commentCount: payload.cc ?? 0,
    nextCursor: payload.nc ?? null,
  };
}

export async function fetchPoemComments(url: string): Promise<PoemCommentsResponse> {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Failed to load comments.");
  }

  const payload = (await response.json()) as
    | Partial<PoemCommentsResponse>
    | CompactPoemCommentsResponse;
  if ("c" in payload || "v" in payload || "cc" in payload || "nc" in payload || "p" in payload) {
    return parseCompactPayload(payload as CompactPoemCommentsResponse);
  }

  const standardPayload = payload as Partial<PoemCommentsResponse>;
  const comments = (standardPayload.comments ?? []).map((comment: DrawerComment) => ({
    ...comment,
    parentCommentId: comment.parentCommentId ?? null,
    likeCount: comment.likeCount ?? 0,
    likedByViewer: Boolean(comment.likedByViewer),
  }));
  return {
    poem: standardPayload.poem ?? null,
    viewer: standardPayload.viewer ?? DEFAULT_VIEWER,
    comments,
    commentCount: standardPayload.commentCount ?? 0,
    nextCursor: standardPayload.nextCursor ?? null,
  };
}
