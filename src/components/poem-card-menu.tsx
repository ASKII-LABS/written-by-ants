"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { MoreHorizontal, PencilLine, Share2, Trash2 } from "lucide-react";

type DeletePoemAction = (formData: FormData) => Promise<void>;

type PoemCardMenuProps = {
  poemId: string;
  poemTitle: string;
  isOwner: boolean;
  deletePoemAction?: DeletePoemAction;
  className?: string;
};

export function PoemCardMenu({
  poemId,
  poemTitle,
  isOwner,
  deletePoemAction,
  className = "absolute right-3 top-3",
}: PoemCardMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<"idle" | "success" | "error">("idle");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onDocumentClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocumentClick);
    document.addEventListener("keydown", onEscape);

    return () => {
      document.removeEventListener("mousedown", onDocumentClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (shareStatus === "idle") {
      return;
    }

    const timer = window.setTimeout(() => {
      setShareStatus("idle");
    }, 1800);

    return () => {
      window.clearTimeout(timer);
    };
  }, [shareStatus]);

  async function onSharePoem() {
    try {
      const shareUrl = new URL(window.location.href);
      shareUrl.hash = `poem-${poemId}`;
      const shareText = `Read "${poemTitle}" on Written by Ants`;
      const url = shareUrl.toString();

      if (navigator.share) {
        await navigator.share({
          title: poemTitle,
          text: shareText,
          url,
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        throw new Error("Clipboard is unavailable.");
      }

      setShareStatus("success");
      setIsOpen(false);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      setShareStatus("error");
    }
  }

  function onDeleteSubmit(event: FormEvent<HTMLFormElement>) {
    if (!confirm("Delete this poem? This action cannot be undone.")) {
      event.preventDefault();
      return;
    }

    setIsOpen(false);
  }

  const showDeleteAction = isOwner && Boolean(deletePoemAction);

  return (
    <div ref={containerRef} className={className}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-label="Open poem actions"
        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-ant-ink/70 transition hover:bg-ant-paper hover:text-ant-primary"
      >
        <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-9 z-30 min-w-36 overflow-hidden rounded border border-ant-border bg-ant-paper shadow-sm">
          {isOwner ? (
            <>
              <Link
                href={`/write?id=${poemId}`}
                className="flex items-center gap-2 px-3 py-2 text-sm text-ant-ink transition hover:bg-ant-paper-2 hover:text-ant-primary"
                onClick={() => setIsOpen(false)}
              >
                <PencilLine aria-hidden="true" className="h-4 w-4" />
                <span>Edit</span>
              </Link>

              {showDeleteAction ? (
                <form action={deletePoemAction} onSubmit={onDeleteSubmit}>
                  <input type="hidden" name="poem_id" value={poemId} />
                  <button
                    type="submit"
                    className="flex w-full cursor-pointer items-center gap-2 border-t border-ant-border px-3 py-2 text-left text-sm text-ant-primary transition hover:bg-ant-paper-2"
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                    <span>Delete</span>
                  </button>
                </form>
              ) : null}
            </>
          ) : (
            <button
              type="button"
              onClick={() => void onSharePoem()}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-ant-ink transition hover:bg-ant-paper-2 hover:text-ant-primary"
            >
              <Share2 aria-hidden="true" className="h-4 w-4" />
              <span>Share</span>
            </button>
          )}
        </div>
      ) : null}

      {shareStatus === "success" ? (
        <p className="absolute right-0 top-9 mt-1 rounded border border-ant-border bg-ant-paper px-2 py-1 text-xs text-ant-ink/80">
          Shared
        </p>
      ) : null}
      {shareStatus === "error" ? (
        <p className="absolute right-0 top-9 mt-1 rounded border border-ant-border bg-ant-paper px-2 py-1 text-xs text-ant-primary">
          Share failed
        </p>
      ) : null}
    </div>
  );
}
