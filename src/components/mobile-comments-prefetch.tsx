"use client";

import { useEffect, useRef } from "react";

import { useDrawerMode } from "@/hooks/use-drawer-mode";
import {
  MOBILE_PREFETCH_COMMENT_PAGE_SIZE,
  prefetchPoemComments,
} from "@/lib/poem-comments";

type MobileCommentsPrefetchProps = {
  poemId: string;
};

export function MobileCommentsPrefetch({ poemId }: MobileCommentsPrefetchProps) {
  const prefetchRef = useRef<HTMLDivElement | null>(null);
  const drawerMode = useDrawerMode();

  useEffect(() => {
    if (drawerMode !== "mobile") {
      return;
    }

    const target = prefetchRef.current;
    if (!target || typeof IntersectionObserver === "undefined") {
      return;
    }

    let hasPrefetched = false;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || hasPrefetched) {
            return;
          }

          hasPrefetched = true;
          prefetchPoemComments(poemId, {
            limit: MOBILE_PREFETCH_COMMENT_PAGE_SIZE,
            sort: "desc",
          });
          observer.disconnect();
        });
      },
      {
        rootMargin: "220px 0px",
        threshold: 0.1,
      },
    );

    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [drawerMode, poemId]);

  return <div ref={prefetchRef} aria-hidden="true" className="h-px w-full" />;
}
