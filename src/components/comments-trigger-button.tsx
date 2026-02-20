"use client";

import { useCallback } from "react";
import { MessageCircle } from "lucide-react";

import { useCommentsDrawer } from "@/components/comments-drawer-provider";
import { useDrawerMode } from "@/hooks/use-drawer-mode";
import { COMMENT_PAGE_SIZE, prefetchPoemComments } from "@/lib/poem-comments";

type CommentsTriggerButtonProps = {
  poemId: string;
  commentCount: number;
  iconClassName?: string;
};

export function CommentsTriggerButton({
  poemId,
  commentCount,
  iconClassName = "h-5 w-5",
}: CommentsTriggerButtonProps) {
  const { openCommentsDrawer } = useCommentsDrawer();
  const drawerMode = useDrawerMode();

  const prefetchDesktopComments = useCallback(() => {
    if (drawerMode !== "desktop") {
      return;
    }

    prefetchPoemComments(poemId, {
      limit: COMMENT_PAGE_SIZE,
      sort: "desc",
    });
  }, [drawerMode, poemId]);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => openCommentsDrawer(poemId)}
        onMouseEnter={prefetchDesktopComments}
        onFocus={prefetchDesktopComments}
        aria-label="Open comments"
        className="inline-flex cursor-pointer items-center justify-center p-1 text-ant-ink/70 transition hover:text-ant-primary"
      >
        <MessageCircle aria-hidden="true" className={iconClassName} />
      </button>
      <span className="tabular-nums text-ant-ink/70">{commentCount}</span>
    </div>
  );
}
