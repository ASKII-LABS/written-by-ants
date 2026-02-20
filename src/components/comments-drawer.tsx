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
import { ArrowUp, X } from "lucide-react";
import useSWRInfinite from "swr/infinite";

import { addCommentAction, type AddedComment } from "@/app/actions";
import { useDrawerMode } from "@/hooks/use-drawer-mode";
import {
  COMMENT_PAGE_SIZE,
  type DrawerComment,
  type PoemCommentsResponse,
  fetchPoemComments,
  getPoemCommentsUrl,
} from "@/lib/poem-comments";
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
  };
}

type CommentCardProps = {
  comment: DrawerComment;
  currentUserId: string | null;
};

function CommentCard({ comment, currentUserId }: CommentCardProps) {
  const authorHref = currentUserId === comment.authorId ? "/profile" : `/poet/${comment.authorId}`;

  return (
    <article
      className={`rounded border border-ant-border bg-ant-paper p-3 ${
        comment.isPending ? "opacity-75" : ""
      }`}
    >
      <p className="text-xs text-ant-ink/70">
        <Link href={authorHref} className="font-medium text-ant-ink transition hover:underline">
          {comment.authorName}
        </Link>{" "}
        <span>- {comment.isPending ? "Sending..." : formatDate(comment.createdAt)}</span>
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-ant-ink/90">{comment.content}</p>
    </article>
  );
}

type VirtualizedCommentListProps = {
  comments: DrawerComment[];
  currentUserId: string | null;
};

function VirtualizedCommentList({ comments, currentUserId }: VirtualizedCommentListProps) {
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
    return comments.reduce(
      (accumulator, comment) => {
        const height = measuredHeights[comment.id] ?? ESTIMATED_COMMENT_HEIGHT;
        return {
          rows: [
            ...accumulator.rows,
            {
              comment,
              top: accumulator.totalHeight,
              height,
            },
          ],
          totalHeight: accumulator.totalHeight + height,
        };
      },
      {
        rows: [] as Array<{ comment: DrawerComment; top: number; height: number }>,
        totalHeight: 0,
      },
    );
  }, [comments, measuredHeights]);

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
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      className="mt-4 max-h-[48vh] overflow-y-auto rounded border border-ant-border bg-ant-paper/40 p-2"
    >
      <ol className="relative" style={{ height: metrics.totalHeight }}>
        {visibleRows.map((row) => (
          <li
            key={row.comment.id}
            className="absolute left-0 right-0"
            style={{ transform: `translateY(${row.top}px)` }}
          >
            <div ref={(node) => setMeasuredHeight(row.comment.id, node)} className="pb-3">
              <CommentCard comment={row.comment} currentUserId={currentUserId} />
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
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [draft, setDraft] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    setSubmitError(null);
    setDragOffsetY(0);
    setIsDragging(false);
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
  const commentCount = pages[0]?.commentCount ?? comments.length;
  const nextCursor = pages.length > 0 ? pages[pages.length - 1]?.nextCursor : null;
  const hasMoreComments = Boolean(nextCursor);

  const isMobile = drawerMode === "mobile";
  const isLoadingInitial = isOpen && !hasCurrentPoemData && (isLoading || isValidating);
  const isLoadingMore = isValidating && pages.length > 0 && size > pages.length;

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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!poemId) {
      return;
    }

    const trimmedDraft = draft.trim();
    if (trimmedDraft.length === 0) {
      return;
    }

    const tempId = createTempCommentId();
    const optimisticComment: DrawerComment = {
      id: tempId,
      authorId: viewer.currentUserId ?? "unknown",
      authorName: viewer.currentUserName ?? "You",
      content: trimmedDraft,
      createdAt: new Date().toISOString(),
      isPending: true,
    };

    setDraft("");
    setSubmitError(null);
    setIsSubmitting(true);

    await mutate(
      (existingPages) => {
        if (!existingPages || existingPages.length === 0) {
          return existingPages;
        }

        const [first, ...rest] = existingPages;
        return [
          {
            ...first,
            commentCount: first.commentCount + 1,
            comments: [optimisticComment, ...first.comments],
          },
          ...rest,
        ];
      },
      { revalidate: false },
    );

    const formData = new FormData();
    formData.set("poem_id", poemId);
    formData.set("content", trimmedDraft);

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

          const [first, ...rest] = existingPages;
          return [
            {
              ...first,
              comments: first.comments.map((comment) =>
                comment.id === tempId ? toDrawerComment(savedComment) : comment,
              ),
            },
            ...rest,
          ];
        },
        { revalidate: false },
      );

      void mutate();
    } catch {
      await mutate(
        (existingPages) => {
          if (!existingPages || existingPages.length === 0) {
            return existingPages;
          }

          const [first, ...rest] = existingPages;
          return [
            {
              ...first,
              commentCount: Math.max(0, first.commentCount - 1),
              comments: first.comments.filter((comment) => comment.id !== tempId),
            },
            ...rest,
          ];
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
    if (deltaY > 0) {
      setDragOffsetY(Math.min(deltaY, 280));
    }
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
    ? `absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col rounded-t-2xl bg-ant-paper-2 shadow-2xl transition-transform ${
        isDragging ? "duration-0" : "duration-200"
      }`
    : "absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col bg-ant-paper-2 shadow-2xl";

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close comments drawer"
        onClick={onClose}
        className="absolute inset-0 bg-ant-ink/45"
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
            className="flex justify-center pb-1 pt-2"
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

        <div className="flex-1 overflow-y-auto px-4 pb-6 pt-3">
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

                {comments.length === 0 ? (
                  <p className="mt-3 text-sm text-ant-ink/70">No comments yet.</p>
                ) : comments.length > VIRTUALIZE_AFTER_COUNT ? (
                  <VirtualizedCommentList comments={comments} currentUserId={viewer.currentUserId} />
                ) : (
                  <ol className="mt-4 space-y-3">
                    {comments.map((comment) => (
                      <li key={comment.id}>
                        <CommentCard comment={comment} currentUserId={viewer.currentUserId} />
                      </li>
                    ))}
                  </ol>
                )}

                {hasMoreComments ? (
                  <button
                    type="button"
                    onClick={() => void setSize(size + 1)}
                    disabled={isLoadingMore}
                    className="mt-4 rounded border border-ant-border px-3 py-1.5 text-sm text-ant-ink transition hover:border-ant-primary hover:text-ant-primary disabled:cursor-not-allowed disabled:opacity-65"
                  >
                    {isLoadingMore ? "Loading..." : "Load older comments"}
                  </button>
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
                        className="col-start-1 row-start-1 w-full resize-none rounded border border-ant-border bg-ant-paper px-4 py-3 pr-16 text-[0.95rem] text-ant-ink outline-none transition focus:border-ant-primary"
                      />

                      <div className="col-start-1 row-start-1 flex items-center justify-end pr-3 pointer-events-none">
                        <button
                          type="submit"
                          disabled={draft.trim().length === 0 || isSubmitting}
                          aria-label={isSubmitting ? "Posting comment" : "Post comment"}
                          className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded border border-ant-primary bg-ant-primary text-ant-paper transition hover:bg-ant-accent disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <ArrowUp aria-hidden="true" className="h-[18px] w-[18px]" />
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
