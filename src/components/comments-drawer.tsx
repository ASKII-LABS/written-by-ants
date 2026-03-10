"use client";

import Link from "next/link";
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type TouchEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowUp, MoreHorizontal, Trash2, X } from "lucide-react";
import useSWRInfinite from "swr/infinite";

import { addCommentAction, deleteCommentAction, type AddedComment } from "@/app/actions";
import { useDrawerMode } from "@/hooks/use-drawer-mode";
import {
  COMMENT_PAGE_SIZE,
  type DrawerComment,
  type PoemCommentsResponse,
  fetchPoemComments,
  getPoemCommentsUrl,
} from "@/lib/poem-comments";
import { createClient as createBrowserClient } from "@/lib/supabase/browser";
import { formatDate } from "@/lib/utils";

const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
const VIRTUALIZE_AFTER_COUNT = 80;
const ESTIMATED_COMMENT_HEIGHT = 112;
const VIRTUAL_OVERSCAN = 6;

type CommentsDrawerProps = {
  poemId: string | null;
  isOpen: boolean;
  onClose: () => void;
};

type RealtimeCommentRow = {
  id?: string;
  poem_id?: string;
  author_id?: string;
  content?: string;
  created_at?: string;
  parent_comment_id?: string | null;
};

function createTempCommentId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `temp-${crypto.randomUUID()}`;
  }

  return `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toDrawerComment(comment: AddedComment): DrawerComment {
  return {
    id: comment.id,
    authorId: comment.authorId,
    authorName: comment.authorName,
    content: comment.content,
    createdAt: comment.createdAt,
    parentCommentId: comment.parentCommentId,
  };
}

function dedupeCommentsById(comments: DrawerComment[]) {
  const seenCommentIds = new Set<string>();
  return comments.filter((comment) => {
    if (seenCommentIds.has(comment.id)) {
      return false;
    }

    seenCommentIds.add(comment.id);
    return true;
  });
}

type ReplyTarget = {
  id: string;
  authorName: string;
};

function toReplyHandle(authorName: string) {
  const compactName = authorName.replace(/\s+/g, "");
  return `@${compactName}`;
}

type ThreadedCommentRow = {
  comment: DrawerComment;
  depth: number;
};

function buildThreadRows(comments: DrawerComment[]): ThreadedCommentRow[] {
  const repliesByParent = new Map<string, DrawerComment[]>();
  const commentIds = new Set(comments.map((comment) => comment.id));
  const topLevelComments: DrawerComment[] = [];

  comments.forEach((comment) => {
    if (comment.parentCommentId && commentIds.has(comment.parentCommentId)) {
      const existingReplies = repliesByParent.get(comment.parentCommentId) ?? [];
      existingReplies.push(comment);
      repliesByParent.set(comment.parentCommentId, existingReplies);
      return;
    }

    topLevelComments.push(comment);
  });

  const rows: ThreadedCommentRow[] = [];
  const visited = new Set<string>();

  const appendComment = (comment: DrawerComment, depth: number) => {
    if (visited.has(comment.id)) {
      return;
    }

    visited.add(comment.id);
    rows.push({ comment, depth });
    (repliesByParent.get(comment.id) ?? []).forEach((reply) => appendComment(reply, depth + 1));
  };

  topLevelComments.forEach((comment) => appendComment(comment, 0));
  comments.forEach((comment) => {
    if (!visited.has(comment.id)) {
      appendComment(comment, 0);
    }
  });

  return rows;
}

function isCommentDescendantOf(
  comment: DrawerComment,
  parentCommentId: string,
  commentsById: Map<string, DrawerComment>,
) {
  let currentParentId = comment.parentCommentId;
  const visitedParentIds = new Set<string>();

  while (currentParentId) {
    if (currentParentId === parentCommentId) {
      return true;
    }

    if (visitedParentIds.has(currentParentId)) {
      return false;
    }

    visitedParentIds.add(currentParentId);
    currentParentId = commentsById.get(currentParentId)?.parentCommentId ?? null;
  }

  return false;
}

function addCommentToPages(
  existingPages: PoemCommentsResponse[] | undefined,
  optimisticComment: DrawerComment,
  parentCommentId: string | null,
) {
  if (!existingPages || existingPages.length === 0) {
    return existingPages;
  }

  if (!parentCommentId) {
    const [first, ...rest] = existingPages;
    return [
      {
        ...first,
        commentCount: first.commentCount + 1,
        comments: [optimisticComment, ...first.comments],
      },
      ...rest,
    ];
  }

  let inserted = false;
  const nextPages = existingPages.map((page) => {
    if (inserted) {
      return page;
    }

    const parentIndex = page.comments.findIndex((comment) => comment.id === parentCommentId);
    if (parentIndex === -1) {
      return page;
    }

    const commentsById = new Map(page.comments.map((comment) => [comment.id, comment]));
    let insertIndex = parentIndex + 1;
    while (
      insertIndex < page.comments.length &&
      isCommentDescendantOf(page.comments[insertIndex], parentCommentId, commentsById)
    ) {
      insertIndex += 1;
    }

    inserted = true;
    return {
      ...page,
      comments: [
        ...page.comments.slice(0, insertIndex),
        optimisticComment,
        ...page.comments.slice(insertIndex),
      ],
    };
  });

  const [first, ...rest] = nextPages;
  if (!first) {
    return nextPages;
  }

  if (inserted) {
    return [
      {
        ...first,
        commentCount: first.commentCount + 1,
      },
      ...rest,
    ];
  }

  return [
    {
      ...first,
      commentCount: first.commentCount + 1,
      comments: [optimisticComment, ...first.comments],
    },
    ...rest,
  ];
}

function collectCommentAndDescendantIds(comments: DrawerComment[], rootCommentId: string) {
  const childIdsByParent = new Map<string, string[]>();
  comments.forEach((comment) => {
    if (!comment.parentCommentId) {
      return;
    }

    const existingChildren = childIdsByParent.get(comment.parentCommentId) ?? [];
    existingChildren.push(comment.id);
    childIdsByParent.set(comment.parentCommentId, existingChildren);
  });

  const idsToRemove = new Set<string>();
  const queue = [rootCommentId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || idsToRemove.has(currentId)) {
      continue;
    }

    idsToRemove.add(currentId);
    (childIdsByParent.get(currentId) ?? []).forEach((childId) => queue.push(childId));
  }

  return idsToRemove;
}

function removeCommentsFromPages(
  existingPages: PoemCommentsResponse[] | undefined,
  idsToRemove: Set<string>,
) {
  if (!existingPages || existingPages.length === 0 || idsToRemove.size === 0) {
    return {
      pages: existingPages,
      removedCount: 0,
    };
  }

  let removedCount = 0;
  const nextPages = existingPages.map((page) => {
    const nextComments = page.comments.filter((comment) => {
      if (!idsToRemove.has(comment.id)) {
        return true;
      }

      removedCount += 1;
      return false;
    });

    return nextComments.length === page.comments.length
      ? page
      : {
          ...page,
          comments: nextComments,
        };
  });

  if (removedCount === 0) {
    return {
      pages: existingPages,
      removedCount: 0,
    };
  }

  const [first, ...rest] = nextPages;
  if (!first) {
    return {
      pages: nextPages,
      removedCount,
    };
  }

  return {
    pages: [
      {
        ...first,
        commentCount: Math.max(0, first.commentCount - removedCount),
      },
      ...rest,
    ],
    removedCount,
  };
}

type CommentCardProps = {
  comment: DrawerComment;
  depth: number;
  canReply: boolean;
  isReplyingToComment: boolean;
  commentById: Map<string, DrawerComment>;
  currentUserId: string | null;
  isDeleting: boolean;
  onReplyComment: (comment: DrawerComment) => void;
  onCancelReply: () => void;
  onDeleteComment: (commentId: string) => void;
};

function CommentCard({
  comment,
  depth,
  canReply,
  isReplyingToComment,
  commentById,
  currentUserId,
  isDeleting,
  onReplyComment,
  onCancelReply,
  onDeleteComment,
}: CommentCardProps) {
  const authorHref = currentUserId === comment.authorId ? "/profile" : `/poet/${comment.authorId}`;
  const parentComment = comment.parentCommentId ? (commentById.get(comment.parentCommentId) ?? null) : null;
  const canDelete = currentUserId === comment.authorId && !comment.isPending;
  const canReplyToComment = canReply && !comment.isPending;
  const isReply = depth > 0;
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isActionsMenuOpen) {
      return;
    }

    const onDocumentClick = (event: MouseEvent) => {
      if (!actionsMenuRef.current?.contains(event.target as Node)) {
        setIsActionsMenuOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsActionsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocumentClick);
    document.addEventListener("keydown", onEscape);

    return () => {
      document.removeEventListener("mousedown", onDocumentClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, [isActionsMenuOpen]);

  const mentionPrefix = parentComment ? `${toReplyHandle(parentComment.authorName)} ` : null;
  const hasMentionPrefix = Boolean(mentionPrefix && comment.content.startsWith(mentionPrefix));
  const mentionHref =
    parentComment && currentUserId === parentComment.authorId
      ? "/profile"
      : parentComment
        ? `/poet/${parentComment.authorId}`
        : null;
  const mentionContent = mentionPrefix
    ? comment.content.slice(mentionPrefix.length)
    : comment.content;

  return (
    <article
      className={`rounded border border-ant-border bg-ant-paper p-3 ${
        isReply ? "ml-6 border-l-2 border-l-ant-border/70" : ""
      } ${
        comment.isPending ? "opacity-75" : ""
      }`}
    >
      <div className={canDelete ? "relative pr-7" : ""}>
        <p className="text-xs text-ant-ink/70">
          <Link href={authorHref} className="font-medium text-ant-ink transition hover:underline">
            {comment.authorName}
          </Link>{" "}
          <span>- {comment.isPending ? "Sending..." : formatDate(comment.createdAt)}</span>
          {canReplyToComment ? (
            <>
              <span className="mx-1">-</span>
              <button
                type="button"
                onClick={() => {
                  if (isReplyingToComment) {
                    onCancelReply();
                    return;
                  }

                  onReplyComment(comment);
                }}
                className="inline-flex items-center rounded text-xs text-ant-ink/70 transition hover:text-ant-primary"
              >
                {isReplyingToComment ? "Cancel reply" : "Reply"}
              </button>
            </>
          ) : null}
        </p>

        {canDelete ? (
          <div ref={actionsMenuRef} className="absolute right-0 top-0">
            <button
              type="button"
              onClick={() => setIsActionsMenuOpen((current) => !current)}
              aria-label="Open comment actions"
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-ant-ink/70 transition hover:bg-ant-paper-2 hover:text-ant-primary"
            >
              <MoreHorizontal aria-hidden="true" className="h-3 w-3" />
            </button>

            {isActionsMenuOpen ? (
              <div className="absolute right-0 top-6 z-20 min-w-24 overflow-hidden rounded border border-ant-border bg-ant-paper shadow-sm">
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm("Delete this comment? This action cannot be undone.")) {
                      return;
                    }

                    setIsActionsMenuOpen(false);
                    onDeleteComment(comment.id);
                  }}
                  disabled={isDeleting}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-ant-primary transition hover:bg-ant-paper-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                  <span>{isDeleting ? "Deleting..." : "Delete"}</span>
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {hasMentionPrefix && mentionHref && mentionPrefix ? (
        <p className="mt-1 whitespace-pre-wrap text-sm text-ant-ink/90">
          <Link href={mentionHref} className="font-medium text-ant-primary transition hover:underline">
            {mentionPrefix.trim()}
          </Link>
          {mentionContent ? <> {mentionContent}</> : null}
        </p>
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-sm text-ant-ink/90">{comment.content}</p>
      )}
    </article>
  );
}

type VirtualizedCommentListProps = {
  rows: ThreadedCommentRow[];
  canReply: boolean;
  replyingToCommentId: string | null;
  commentById: Map<string, DrawerComment>;
  currentUserId: string | null;
  deletingCommentIds: Set<string>;
  hasMoreComments: boolean;
  isLoadingMore: boolean;
  onReplyComment: (comment: DrawerComment) => void;
  onCancelReply: () => void;
  onDeleteComment: (commentId: string) => void;
  onLoadMoreComments: () => void;
};

function VirtualizedCommentList({
  rows,
  canReply,
  replyingToCommentId,
  commentById,
  currentUserId,
  deletingCommentIds,
  hasMoreComments,
  isLoadingMore,
  onReplyComment,
  onCancelReply,
  onDeleteComment,
  onLoadMoreComments,
}: VirtualizedCommentListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [measuredHeights, setMeasuredHeights] = useState<Record<string, number>>({});
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") {
      return;
    }

    setViewportHeight(container.clientHeight);
    const observer = new ResizeObserver((entries) => {
      const nextHeight = entries[0]?.contentRect.height ?? container.clientHeight;
      setViewportHeight(nextHeight);
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  const metrics = useMemo(() => {
    return rows.reduce(
      (accumulator, row) => {
        const height = measuredHeights[row.comment.id] ?? ESTIMATED_COMMENT_HEIGHT;
        return {
          rows: [
            ...accumulator.rows,
            {
              row,
              top: accumulator.totalHeight,
              height,
            },
          ],
          totalHeight: accumulator.totalHeight + height,
        };
      },
      {
        rows: [] as Array<{ row: ThreadedCommentRow; top: number; height: number }>,
        totalHeight: 0,
      },
    );
  }, [rows, measuredHeights]);

  const [startIndex, endIndex] = useMemo(() => {
    if (metrics.rows.length === 0) {
      return [0, 0];
    }

    const startBoundary = Math.max(0, scrollTop - VIRTUAL_OVERSCAN * ESTIMATED_COMMENT_HEIGHT);
    const endBoundary =
      scrollTop + viewportHeight + VIRTUAL_OVERSCAN * ESTIMATED_COMMENT_HEIGHT;

    let start = 0;
    while (
      start < metrics.rows.length &&
      metrics.rows[start].top + metrics.rows[start].height < startBoundary
    ) {
      start += 1;
    }

    let end = start;
    while (end < metrics.rows.length && metrics.rows[end].top < endBoundary) {
      end += 1;
    }

    return [start, Math.max(start + 1, end)];
  }, [metrics, scrollTop, viewportHeight]);

  const visibleRows = metrics.rows.slice(startIndex, endIndex);

  const setMeasuredHeight = useCallback((commentId: string, node: HTMLDivElement | null) => {
    if (!node) {
      return;
    }

    const nextHeight = node.offsetHeight;
    setMeasuredHeights((current) =>
      current[commentId] === nextHeight
        ? current
        : {
            ...current,
            [commentId]: nextHeight,
          },
    );
  }, []);

  return (
    <div
      ref={containerRef}
      onScroll={(event) => {
        const container = event.currentTarget;
        const nextScrollTop = container.scrollTop;
        setScrollTop(nextScrollTop);

        const isNearBottom =
          nextScrollTop + container.clientHeight >= container.scrollHeight - 140;
        if (isNearBottom && hasMoreComments && !isLoadingMore) {
          onLoadMoreComments();
        }
      }}
      className="mt-4 max-h-[48vh] overflow-y-auto rounded border border-ant-border bg-ant-paper/40 p-2"
    >
      <ol className="relative" style={{ height: metrics.totalHeight }}>
        {visibleRows.map((row) => (
          <li
            key={row.row.comment.id}
            className="absolute left-0 right-0"
            style={{ transform: `translateY(${row.top}px)` }}
          >
            <div ref={(node) => setMeasuredHeight(row.row.comment.id, node)} className="pb-3">
              <CommentCard
                comment={row.row.comment}
                depth={row.row.depth}
                canReply={canReply}
                isReplyingToComment={replyingToCommentId === row.row.comment.id}
                commentById={commentById}
                currentUserId={currentUserId}
                isDeleting={deletingCommentIds.has(row.row.comment.id)}
                onReplyComment={onReplyComment}
                onCancelReply={onCancelReply}
                onDeleteComment={onDeleteComment}
              />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DrawerSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="animate-pulse rounded border border-ant-border bg-ant-paper p-3">
            <div className="h-3 w-1/3 rounded bg-ant-border/45" />
            <div className="mt-2 h-3 w-full rounded bg-ant-border/35" />
            <div className="mt-1 h-3 w-5/6 rounded bg-ant-border/35" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CommentsDrawer({ poemId, isOpen, onClose }: CommentsDrawerProps) {
  const drawerMode = useDrawerMode();
  const supabase = useMemo(() => createBrowserClient(), []);
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const commentsScrollRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const pendingPageLoadRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const authorNameByIdRef = useRef<Map<string, string>>(new Map());
  const loadingAuthorIdsRef = useRef<Set<string>>(new Set());

  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [draft, setDraft] = useState("");
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingCommentIds, setDeletingCommentIds] = useState<Set<string>>(new Set());

  const { data, error, isLoading, isValidating, mutate, setSize, size } =
    useSWRInfinite<PoemCommentsResponse>(
      (pageIndex, previousPageData) => {
        if (!isOpen || !poemId) {
          return null;
        }

        if (pageIndex === 0) {
          return getPoemCommentsUrl(poemId, {
            limit: COMMENT_PAGE_SIZE,
            sort: "desc",
          });
        }

        if (!previousPageData?.nextCursor) {
          return null;
        }

        return getPoemCommentsUrl(poemId, {
          limit: COMMENT_PAGE_SIZE,
          sort: "desc",
          cursor: previousPageData.nextCursor,
        });
      },
      fetchPoemComments,
      {
        keepPreviousData: true,
        dedupingInterval: 60_000,
        revalidateFirstPage: false,
      },
    );

  useEffect(() => {
    if (!isOpen || !poemId) {
      return;
    }

    setDraft("");
    setReplyTarget(null);
    setSubmitError(null);
    setDeletingCommentIds(new Set());
    setDragOffsetY(0);
    setIsDragging(false);
    pendingPageLoadRef.current = false;
    void setSize(1);
  }, [isOpen, poemId, setSize]);

  const firstPage = data?.[0];
  const hasCurrentPoemData = Boolean(poemId && firstPage?.poem?.id === poemId);
  const pages = useMemo(
    () => (hasCurrentPoemData ? (data ?? []) : []),
    [data, hasCurrentPoemData],
  );
  const poem = pages[0]?.poem ?? null;
  const viewer = pages[0]?.viewer ?? {
    isSignedIn: false,
    currentUserId: null,
    currentUserName: null,
  };
  const comments = useMemo(() => pages.flatMap((page) => page.comments), [pages]);
  const commentById = useMemo(() => new Map(comments.map((comment) => [comment.id, comment])), [comments]);
  const threadedCommentRows = useMemo(() => buildThreadRows(comments), [comments]);
  const replyingToCommentId = replyTarget?.id ?? null;
  const commentCount = pages[0]?.commentCount ?? comments.length;
  const nextCursor = pages.length > 0 ? pages[pages.length - 1]?.nextCursor : null;
  const hasMoreComments = Boolean(nextCursor);
  const shouldUseVirtualizedList = threadedCommentRows.length > VIRTUALIZE_AFTER_COUNT;

  const isMobile = drawerMode === "mobile";
  const isLoadingInitial = isOpen && !hasCurrentPoemData && (isLoading || isValidating);
  const isLoadingMore = isValidating && pages.length > 0 && size > pages.length;

  const loadMoreComments = useCallback(() => {
    if (!hasMoreComments || isLoadingMore || pendingPageLoadRef.current) {
      return;
    }

    pendingPageLoadRef.current = true;
    void setSize((currentSize) => currentSize + 1);
  }, [hasMoreComments, isLoadingMore, setSize]);

  useEffect(() => {
    if (!isLoadingMore) {
      pendingPageLoadRef.current = false;
    }
  }, [isLoadingMore]);

  useEffect(() => {
    if (!isOpen || shouldUseVirtualizedList || !hasMoreComments || isLoadingMore) {
      return;
    }

    const root = commentsScrollRef.current;
    const target = loadMoreSentinelRef.current;
    if (!root || !target || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            loadMoreComments();
          }
        });
      },
      {
        root,
        rootMargin: "0px 0px 220px 0px",
        threshold: 0.1,
      },
    );

    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [hasMoreComments, isLoadingMore, isOpen, loadMoreComments, shouldUseVirtualizedList]);

  useEffect(() => {
    const authorNameById = authorNameByIdRef.current;
    comments.forEach((comment) => {
      authorNameById.set(comment.authorId, comment.authorName);
    });

    if (viewer.currentUserId && viewer.currentUserName) {
      authorNameById.set(viewer.currentUserId, viewer.currentUserName);
    }
  }, [comments, viewer.currentUserId, viewer.currentUserName]);

  const syncComposerHeight = useCallback((element: HTMLTextAreaElement | null) => {
    if (!element) {
      return;
    }

    const maxHeight = 196;
    element.style.height = "0px";
    const nextHeight = Math.max(52, Math.min(element.scrollHeight, maxHeight));
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = element.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    syncComposerHeight(inputRef.current);
  }, [draft, isOpen, syncComposerHeight]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    window.requestAnimationFrame(() => {
      if (!isMobile && closeButtonRef.current) {
        closeButtonRef.current.focus();
        return;
      }

      panelRef.current?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const panel = panelRef.current;
      if (!panel) {
        return;
      }

      const focusableElements = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusableElements.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocusedRef.current?.focus();
    };
  }, [isMobile, isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !viewer.isSignedIn) {
      return;
    }

    inputRef.current?.focus();
  }, [isOpen, poemId, viewer.isSignedIn]);

  useEffect(() => {
    if (!replyTarget) {
      return;
    }

    const replyTargetExists = comments.some((comment) => comment.id === replyTarget.id);
    if (!replyTargetExists) {
      setReplyTarget(null);
    }
  }, [comments, replyTarget]);

  useEffect(() => {
    if (!isOpen || !poemId) {
      return;
    }

    let isCancelled = false;

    async function resolveAuthorName(authorId: string) {
      const cachedAuthorName = authorNameByIdRef.current.get(authorId);
      if (cachedAuthorName) {
        return cachedAuthorName;
      }

      if (loadingAuthorIdsRef.current.has(authorId)) {
        return "Poet";
      }

      loadingAuthorIdsRef.current.add(authorId);
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", authorId)
          .maybeSingle();

        const authorName = profile?.display_name ?? "Poet";
        authorNameByIdRef.current.set(authorId, authorName);
        return authorName;
      } finally {
        loadingAuthorIdsRef.current.delete(authorId);
      }
    }

    async function handleInsert(row: RealtimeCommentRow) {
      if (isCancelled || !row.id || !row.author_id || !row.content || !row.created_at) {
        return;
      }

      const authorName = await resolveAuthorName(row.author_id);
      if (isCancelled) {
        return;
      }

      const incomingComment: DrawerComment = {
        id: row.id,
        authorId: row.author_id,
        authorName,
        content: row.content,
        createdAt: row.created_at,
        parentCommentId: row.parent_comment_id ?? null,
      };

      await mutate(
        (existingPages) => {
          if (!existingPages || existingPages.length === 0) {
            return existingPages;
          }

          const alreadyExists = existingPages.some((page) =>
            page.comments.some((comment) => comment.id === incomingComment.id),
          );
          if (alreadyExists) {
            return existingPages.map((page) => ({
              ...page,
              comments: page.comments.map((comment) =>
                comment.id === incomingComment.id
                  ? {
                      ...comment,
                      ...incomingComment,
                      isPending: false,
                    }
                  : comment,
              ),
            }));
          }

          const parentIsLoaded =
            !incomingComment.parentCommentId ||
            existingPages.some((page) =>
              page.comments.some((comment) => comment.id === incomingComment.parentCommentId),
            );

          if (parentIsLoaded) {
            return addCommentToPages(existingPages, incomingComment, incomingComment.parentCommentId);
          }

          const [first, ...rest] = existingPages;
          if (!first) {
            return existingPages;
          }

          return [
            {
              ...first,
              commentCount: first.commentCount + 1,
            },
            ...rest,
          ];
        },
        { revalidate: false },
      );
    }

    async function handleUpdate(row: RealtimeCommentRow) {
      if (isCancelled || !row.id) {
        return;
      }

      const authorName = row.author_id ? await resolveAuthorName(row.author_id) : null;
      if (isCancelled) {
        return;
      }

      await mutate(
        (existingPages) => {
          if (!existingPages || existingPages.length === 0) {
            return existingPages;
          }

          let updated = false;
          const nextPages = existingPages.map((page) => ({
            ...page,
            comments: page.comments.map((comment) => {
              if (comment.id !== row.id) {
                return comment;
              }

              updated = true;
              return {
                ...comment,
                authorId: row.author_id ?? comment.authorId,
                authorName: authorName ?? comment.authorName,
                content: row.content ?? comment.content,
                createdAt: row.created_at ?? comment.createdAt,
                parentCommentId: row.parent_comment_id ?? comment.parentCommentId,
                isPending: false,
              };
            }),
          }));

          return updated ? nextPages : existingPages;
        },
        { revalidate: false },
      );
    }

    async function handleDelete(row: RealtimeCommentRow) {
      if (isCancelled || !row.id) {
        return;
      }

      let removedVisibleComments = 0;
      await mutate(
        (existingPages) => {
          const { pages, removedCount } = removeCommentsFromPages(existingPages, new Set([row.id ?? ""]));
          removedVisibleComments = removedCount;

          if (!pages || pages.length === 0 || removedCount > 0) {
            return pages;
          }

          const [first, ...rest] = pages;
          if (!first) {
            return pages;
          }

          return [
            {
              ...first,
              commentCount: Math.max(0, first.commentCount - 1),
            },
            ...rest,
          ];
        },
        { revalidate: false },
      );

      setReplyTarget((current) => (current?.id === row.id ? null : current));

      if (removedVisibleComments === 0) {
        void mutate();
      }
    }

    const channel = supabase
      .channel(`comments-realtime:${poemId}:${Date.now().toString(36)}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
          filter: `poem_id=eq.${poemId}`,
        },
        (payload) => {
          void handleInsert(payload.new as RealtimeCommentRow);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "comments",
          filter: `poem_id=eq.${poemId}`,
        },
        (payload) => {
          void handleUpdate(payload.new as RealtimeCommentRow);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "comments",
          filter: `poem_id=eq.${poemId}`,
        },
        (payload) => {
          void handleDelete(payload.old as RealtimeCommentRow);
        },
      )
      .subscribe();

    return () => {
      isCancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [isOpen, mutate, poemId, supabase]);

  function onReplyComment(comment: DrawerComment) {
    const replyPrefix = `${toReplyHandle(comment.authorName)} `;
    const previousReplyPrefix = replyTarget
      ? `${toReplyHandle(replyTarget.authorName)} `
      : null;
    setReplyTarget({
      id: comment.id,
      authorName: comment.authorName,
    });
    setDraft((currentDraft) => {
      const baseDraft =
        previousReplyPrefix && currentDraft.startsWith(previousReplyPrefix)
          ? currentDraft.slice(previousReplyPrefix.length)
          : currentDraft;
      const trimmedDraft = baseDraft.trim();
      if (trimmedDraft.length === 0) {
        return replyPrefix;
      }

      if (trimmedDraft.startsWith(replyPrefix)) {
        return baseDraft;
      }

      return `${replyPrefix}${trimmedDraft}`;
    });
    inputRef.current?.focus();
  }

  function onCancelReply() {
    if (replyTarget) {
      const replyPrefix = `${toReplyHandle(replyTarget.authorName)} `;
      setDraft((currentDraft) => {
        if (!currentDraft.startsWith(replyPrefix)) {
          return currentDraft;
        }

        return currentDraft.slice(replyPrefix.length);
      });
    }

    setReplyTarget(null);
    inputRef.current?.focus();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!poemId) {
      return;
    }

    const trimmedDraft = draft.trim();
    if (trimmedDraft.length === 0) {
      return;
    }

    const parentCommentId = replyTarget?.id ?? null;
    const tempId = createTempCommentId();
    const optimisticComment: DrawerComment = {
      id: tempId,
      authorId: viewer.currentUserId ?? "unknown",
      authorName: viewer.currentUserName ?? "You",
      content: trimmedDraft,
      createdAt: new Date().toISOString(),
      parentCommentId,
      isPending: true,
    };

    setDraft("");
    setReplyTarget(null);
    setSubmitError(null);
    setIsSubmitting(true);

    void mutate(
      (existingPages) => {
        return addCommentToPages(existingPages, optimisticComment, parentCommentId);
      },
      { revalidate: false },
    );

    const formData = new FormData();
    formData.set("poem_id", poemId);
    formData.set("content", trimmedDraft);
    if (parentCommentId) {
      formData.set("parent_comment_id", parentCommentId);
    }

    try {
      const savedComment = await addCommentAction(formData);
      if (!savedComment) {
        throw new Error("Comment was not saved.");
      }

      await mutate(
        (existingPages) => {
          if (!existingPages || existingPages.length === 0) {
            return existingPages;
          }

          return existingPages.map((page) => ({
            ...page,
            comments: dedupeCommentsById(
              page.comments.map((comment) =>
                comment.id === tempId ? toDrawerComment(savedComment) : comment,
              ),
            ),
          }));
        },
        { revalidate: false },
      );

      void mutate();
    } catch {
      await mutate(
        (existingPages) => {
          const { pages } = removeCommentsFromPages(existingPages, new Set([tempId]));
          return pages;
        },
        { revalidate: false },
      );

      setDraft(trimmedDraft);
      setSubmitError("Could not post your comment. Try again.");
    } finally {
      setIsSubmitting(false);
      inputRef.current?.focus();
    }
  }

  async function onDeleteComment(commentId: string) {
    if (!poemId || deletingCommentIds.has(commentId)) {
      return;
    }

    const previousPages = data;
    let idsRemovedOptimistically = new Set<string>([commentId]);
    setSubmitError(null);
    setDeletingCommentIds((current) => new Set(current).add(commentId));

    await mutate(
      (existingPages) => {
        if (!existingPages || existingPages.length === 0) {
          return existingPages;
        }

        const allComments = existingPages.flatMap((page) => page.comments);
        idsRemovedOptimistically = collectCommentAndDescendantIds(allComments, commentId);
        const { pages } = removeCommentsFromPages(existingPages, idsRemovedOptimistically);
        return pages;
      },
      { revalidate: false },
    );

    if (replyTarget && idsRemovedOptimistically.has(replyTarget.id)) {
      setReplyTarget(null);
    }

    const formData = new FormData();
    formData.set("poem_id", poemId);
    formData.set("comment_id", commentId);

    try {
      const deleted = await deleteCommentAction(formData);
      if (!deleted) {
        throw new Error("Comment was not deleted.");
      }

      void mutate();
    } catch {
      if (previousPages) {
        await mutate(previousPages, { revalidate: false });
      } else {
        void mutate();
      }

      setSubmitError("Could not delete your comment. Try again.");
    } finally {
      setDeletingCommentIds((current) => {
        const next = new Set(current);
        next.delete(commentId);
        return next;
      });
    }
  }

  function onComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    if (draft.trim().length === 0 || isSubmitting) {
      return;
    }

    event.currentTarget.form?.requestSubmit();
  }

  function onTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (!isMobile) {
      return;
    }

    touchStartYRef.current = event.touches[0]?.clientY ?? null;
    setIsDragging(true);
  }

  function onTouchMove(event: TouchEvent<HTMLDivElement>) {
    if (!isMobile || touchStartYRef.current === null) {
      return;
    }

    const deltaY = (event.touches[0]?.clientY ?? 0) - touchStartYRef.current;
    const clampedDeltaY = Math.max(-120, Math.min(deltaY, 280));
    setDragOffsetY(clampedDeltaY);
  }

  function onTouchEnd() {
    if (!isMobile) {
      return;
    }

    if (dragOffsetY > 120) {
      onClose();
    }

    touchStartYRef.current = null;
    setIsDragging(false);
    setDragOffsetY(0);
  }

  if (!isOpen || !poemId) {
    return null;
  }

  const panelClassName = isMobile
    ? `absolute inset-x-0 bottom-0 flex max-h-[92dvh] touch-pan-y flex-col rounded-t-2xl bg-ant-paper-2 shadow-2xl transition-transform will-change-transform ${
        isDragging ? "duration-0" : "duration-300 ease-out"
      }`
    : "absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col bg-ant-paper-2 shadow-2xl";

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close comments drawer"
        onClick={onClose}
        className="absolute inset-0 bg-black/55"
      />

      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="comments-drawer-title"
        tabIndex={-1}
        className={panelClassName}
        style={isMobile ? { transform: `translateY(${dragOffsetY}px)` } : undefined}
      >
        {isMobile ? (
          <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            className="flex touch-none justify-center pb-1 pt-2"
          >
            <span className="h-1.5 w-12 rounded-full bg-ant-border" />
          </div>
        ) : null}

        <header
          className={`sticky top-0 z-20 flex items-center bg-ant-paper-2/90 px-4 py-3 backdrop-blur ${
            isMobile ? "justify-center" : "justify-between"
          }`}
        >
          <h2 id="comments-drawer-title" className="font-serif text-2xl text-ant-primary">
            Comments
          </h2>
          {!isMobile ? (
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded text-ant-ink transition hover:text-ant-primary"
              aria-label="Close comments drawer"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          ) : null}
        </header>

        <div
          ref={commentsScrollRef}
          className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3"
        >
          {isLoadingInitial ? <DrawerSkeleton /> : null}

          {!isLoadingInitial && error && !poem ? (
            <p className="rounded border border-ant-border bg-ant-paper p-3 text-sm text-ant-primary">
              Could not load this poem right now.
            </p>
          ) : null}

          {!isLoadingInitial && !error && poem ? (
            <>
              <section>
                <p className="text-sm text-ant-ink/70">{commentCount} comments</p>

                {threadedCommentRows.length === 0 ? (
                  <p className="mt-3 text-sm text-ant-ink/70">No comments yet.</p>
                ) : shouldUseVirtualizedList ? (
                  <VirtualizedCommentList
                    rows={threadedCommentRows}
                    canReply={viewer.isSignedIn}
                    replyingToCommentId={replyingToCommentId}
                    commentById={commentById}
                    currentUserId={viewer.currentUserId}
                    deletingCommentIds={deletingCommentIds}
                    hasMoreComments={hasMoreComments}
                    isLoadingMore={isLoadingMore}
                    onReplyComment={onReplyComment}
                    onCancelReply={onCancelReply}
                    onDeleteComment={onDeleteComment}
                    onLoadMoreComments={loadMoreComments}
                  />
                ) : (
                  <ol className="mt-4 space-y-3">
                    {threadedCommentRows.map((row) => (
                      <li key={row.comment.id}>
                        <CommentCard
                          comment={row.comment}
                          depth={row.depth}
                          canReply={viewer.isSignedIn}
                          isReplyingToComment={replyingToCommentId === row.comment.id}
                          commentById={commentById}
                          currentUserId={viewer.currentUserId}
                          isDeleting={deletingCommentIds.has(row.comment.id)}
                          onReplyComment={onReplyComment}
                          onCancelReply={onCancelReply}
                          onDeleteComment={onDeleteComment}
                        />
                      </li>
                    ))}
                  </ol>
                )}

                {!shouldUseVirtualizedList && hasMoreComments ? (
                  <div ref={loadMoreSentinelRef} aria-hidden="true" className="mt-4 h-1 w-full" />
                ) : null}
                {isLoadingMore ? (
                  <p className="mt-4 text-xs text-ant-ink/60">Loading older comments...</p>
                ) : null}

                {viewer.isSignedIn ? (
                  <form onSubmit={onSubmit} className="mt-5">
                    <label htmlFor="drawer-comment-content" className="sr-only">
                      Add a comment
                    </label>

                    <div className="grid">
                      <textarea
                        id="drawer-comment-content"
                        ref={inputRef}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={onComposerKeyDown}
                        rows={1}
                        placeholder="Leave a comment..."
                        className="
                          col-start-1 row-start-1
                          w-full resize-none
                          min-h-[52px]
                          leading-6
                          overflow-hidden
                          rounded border border-ant-border
                          bg-ant-paper
                          px-4 py-3 pr-14
                          text-[0.95rem] text-ant-ink
                          outline-none transition
                          focus:border-ant-primary
                        "
                      />

                      <div className="pointer-events-none col-start-1 row-start-1 flex items-center justify-end pr-2">
                        <button
                          type="submit"
                          disabled={draft.trim().length === 0 || isSubmitting}
                          aria-label={isSubmitting ? "Posting comment" : "Post comment"}
                          className="
                            pointer-events-auto
                            inline-flex h-8 w-8 items-center justify-center
                            rounded border border-ant-primary
                            bg-ant-primary text-ant-paper
                            transition hover:bg-ant-accent
                            disabled:cursor-not-allowed disabled:opacity-60
                          "
                        >
                          <ArrowUp aria-hidden="true" className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {submitError ? <p className="mt-2 text-xs text-ant-primary">{submitError}</p> : null}
                  </form>
                ) : (
                  <p className="mt-5 text-sm text-ant-ink/70">
                    <Link href="/login" className="text-ant-primary transition hover:underline">
                      Sign in
                    </Link>{" "}
                    to leave a comment.
                  </p>
                )}
              </section>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
