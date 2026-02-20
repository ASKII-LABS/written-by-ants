"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

import { CommentsDrawer } from "@/components/comments-drawer";

type CommentsDrawerContextValue = {
  openCommentsDrawer: (poemId: string) => void;
  closeCommentsDrawer: () => void;
  isCommentsDrawerOpen: boolean;
  activePoemId: string | null;
};

const CommentsDrawerContext = createContext<CommentsDrawerContextValue | null>(null);

export function CommentsDrawerProvider({ children }: { children: ReactNode }) {
  const [activePoemId, setActivePoemId] = useState<string | null>(null);
  const [isCommentsDrawerOpen, setIsCommentsDrawerOpen] = useState(false);

  const openCommentsDrawer = useCallback((poemId: string) => {
    setActivePoemId(poemId);
    setIsCommentsDrawerOpen(true);
  }, []);

  const closeCommentsDrawer = useCallback(() => {
    setIsCommentsDrawerOpen(false);
  }, []);

  const value = useMemo<CommentsDrawerContextValue>(
    () => ({
      openCommentsDrawer,
      closeCommentsDrawer,
      isCommentsDrawerOpen,
      activePoemId,
    }),
    [openCommentsDrawer, closeCommentsDrawer, isCommentsDrawerOpen, activePoemId],
  );

  return (
    <CommentsDrawerContext.Provider value={value}>
      {children}
      <CommentsDrawer
        poemId={activePoemId}
        isOpen={isCommentsDrawerOpen}
        onClose={closeCommentsDrawer}
      />
    </CommentsDrawerContext.Provider>
  );
}

export function useCommentsDrawer() {
  const context = useContext(CommentsDrawerContext);
  if (!context) {
    throw new Error("useCommentsDrawer must be used within CommentsDrawerProvider");
  }

  return context;
}
