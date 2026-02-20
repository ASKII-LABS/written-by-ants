import { preload } from "swr";

export const COMMENT_PAGE_SIZE = 12;
export const MOBILE_PREFETCH_COMMENT_PAGE_SIZE = 12;

export type DrawerPoem = {
  id: string;
  title: string;
  safeContentHtml: string;
  titleFont: string | null;
  contentFont: string | null;
  authorId: string;
  authorName: string;
  createdAt: string;
  likeCount: number;
  likedByViewer: boolean;
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

  const suffix = params.toString();
  return suffix.length > 0
    ? `/api/poems/${poemId}/comments?${suffix}`
    : `/api/poems/${poemId}/comments`;
}

export async function fetchPoemComments(url: string): Promise<PoemCommentsResponse> {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Failed to load comments.");
  }

  const payload = (await response.json()) as Partial<PoemCommentsResponse>;
  return {
    poem: payload.poem ?? null,
    viewer: payload.viewer ?? DEFAULT_VIEWER,
    comments: payload.comments ?? [],
    commentCount: payload.commentCount ?? 0,
    nextCursor: payload.nextCursor ?? null,
  };
}

export function prefetchPoemComments(
  poemId: string,
  options: {
    limit?: number;
    sort?: "asc" | "desc";
  } = {},
) {
  const url = getPoemCommentsUrl(poemId, {
    limit: options.limit ?? COMMENT_PAGE_SIZE,
    sort: options.sort ?? "desc",
  });

  void preload(url, fetchPoemComments);
}
