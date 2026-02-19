"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

import { addCommentAction, type AddedComment } from "@/app/actions";
import { formatDate } from "@/lib/utils";

export type PoemComment = {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
  isPending?: boolean;
};

type PoemCommentsProps = {
  poemId: string;
  isSignedIn: boolean;
  currentUserId: string | null;
  currentUserName: string | null;
};

function createTempCommentId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `temp-${crypto.randomUUID()}`;
  }

  return `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toComment(comment: AddedComment): PoemComment {
  return {
    id: comment.id,
    authorId: comment.authorId,
    authorName: comment.authorName,
    content: comment.content,
    createdAt: comment.createdAt,
  };
}

export function PoemComments({
  poemId,
  isSignedIn,
  currentUserId,
  currentUserName,
}: PoemCommentsProps) {
  const [serverComments, setServerComments] = useState<PoemComment[]>([]);
  const [optimisticComments, setOptimisticComments] = useState<PoemComment[]>([]);
  const [draft, setDraft] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (isSignedIn) {
      inputRef.current?.focus();
    }
  }, [isSignedIn]);

  useEffect(() => {
    let isSubscribed = true;

    async function loadComments() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const response = await fetch(`/api/poems/${poemId}/comments`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to load comments.");
        }

        const payload = (await response.json()) as { comments?: PoemComment[] };
        if (!isSubscribed) {
          return;
        }

        setServerComments(payload.comments ?? []);
      } catch {
        if (!isSubscribed) {
          return;
        }

        setLoadError("Could not load comments.");
      } finally {
        if (isSubscribed) {
          setIsLoading(false);
        }
      }
    }

    void loadComments();

    return () => {
      isSubscribed = false;
    };
  }, [poemId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedContent = draft.trim();
    if (!trimmedContent) {
      return;
    }

    const tempId = createTempCommentId();
    const optimisticComment: PoemComment = {
      id: tempId,
      authorId: currentUserId ?? "unknown",
      authorName: currentUserName ?? "You",
      content: trimmedContent,
      createdAt: new Date().toISOString(),
      isPending: true,
    };

    setSubmitError(null);
    setDraft("");
    setOptimisticComments((existing) => [...existing, optimisticComment]);

    const formData = new FormData();
    formData.set("poem_id", poemId);
    formData.set("content", trimmedContent);

    try {
      const savedComment = await addCommentAction(formData);

      if (!savedComment) {
        throw new Error("Comment was not saved.");
      }

      setOptimisticComments((existing) =>
        existing.filter((comment) => comment.id !== tempId),
      );
      setServerComments((existing) =>
        existing.some((comment) => comment.id === savedComment.id)
          ? existing
          : [...existing, toComment(savedComment)],
      );
    } catch {
      setOptimisticComments((existing) =>
        existing.filter((comment) => comment.id !== tempId),
      );
      setDraft(trimmedContent);
      setSubmitError("Could not post your comment. Try again.");
    } finally {
      inputRef.current?.focus();
    }
  }

  const comments = [...serverComments, ...optimisticComments];

  return (
    <section id="comments" className="mt-8 border-t border-ant-border pt-5">
      <h2 className="font-serif text-2xl text-ant-primary">Comments</h2>

      {isLoading && comments.length === 0 ? (
        <p className="mt-3 text-sm text-ant-ink/70">Loading comments...</p>
      ) : loadError && comments.length === 0 ? (
        <p className="mt-3 text-sm text-ant-primary">{loadError}</p>
      ) : comments.length === 0 ? (
        <p className="mt-3 text-sm text-ant-ink/70">No comments yet.</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className={`rounded border border-ant-border bg-ant-paper p-3 ${
                comment.isPending ? "opacity-70" : ""
              }`}
            >
              <p className="text-xs text-ant-ink/70">
                <Link
                  href={currentUserId === comment.authorId ? "/profile" : `/poet/${comment.authorId}`}
                  className="font-medium text-ant-ink transition hover:underline"
                >
                  {comment.authorName}
                </Link>{" "}
                <span>- {comment.isPending ? "Sending..." : formatDate(comment.createdAt)}</span>
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ant-ink/90">{comment.content}</p>
            </li>
          ))}
        </ol>
      )}

      {isSignedIn ? (
        <form onSubmit={onSubmit} className="mt-4 space-y-2">
          <label htmlFor="comment-content" className="sr-only">
            Add a comment
          </label>
          <textarea
            id="comment-content"
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            autoFocus
            rows={3}
            placeholder="Write a comment..."
            className="w-full rounded border border-ant-border bg-ant-paper px-3 py-2 text-sm text-ant-ink outline-none transition focus:border-ant-primary"
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={draft.trim().length === 0}
              className="cursor-pointer rounded border border-ant-primary bg-ant-primary px-3 py-1 text-sm font-medium text-ant-paper transition hover:bg-ant-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              Post
            </button>
            {submitError ? <p className="text-xs text-ant-primary">{submitError}</p> : null}
          </div>
        </form>
      ) : (
        <p className="mt-4 text-sm text-ant-ink/70">
          <Link href="/login" className="text-ant-primary transition hover:underline">
            Sign in
          </Link>{" "}
          to leave a comment.
        </p>
      )}
    </section>
  );
}
