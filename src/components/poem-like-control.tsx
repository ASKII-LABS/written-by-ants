"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Heart } from "lucide-react";

import { setLikeStateAction } from "@/app/actions";

type PoemLikeControlProps = {
  poemId: string;
  initialLiked: boolean;
  initialLikeCount: number;
};

type LikeButtonProps = {
  liked: boolean;
  animationToken: number;
  isSyncing: boolean;
  onClick: () => void;
};

function LikeButton({ liked, animationToken, isSyncing, onClick }: LikeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={liked ? "Unlike poem" : "Like poem"}
      title={liked ? "Unlike" : "Like"}
      className={`group inline-flex cursor-pointer items-center justify-center p-0.5 transition ${
        liked ? "text-ant-primary" : "text-ant-ink/70 hover:text-ant-primary"
      } ${isSyncing ? "opacity-80" : ""}`}
    >
      <Heart
        key={animationToken}
        aria-hidden="true"
        className={`h-5 w-5 transition ${
          liked
            ? "animate-like-pop fill-ant-primary text-ant-primary motion-reduce:animate-none"
            : "text-ant-ink/70 group-hover:text-ant-primary"
        }`}
      />
    </button>
  );
}

export function PoemLikeControl({ poemId, initialLiked, initialLikeCount }: PoemLikeControlProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [likeAnimationToken, setLikeAnimationToken] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const desiredLikedRef = useRef(initialLiked);
  const confirmedLikedRef = useRef(initialLiked);
  const inFlightRef = useRef(false);

  const likeCount = useMemo(() => {
    const initialContribution = initialLiked ? 1 : 0;
    const currentContribution = liked ? 1 : 0;
    return Math.max(0, initialLikeCount + (currentContribution - initialContribution));
  }, [liked, initialLiked, initialLikeCount]);

  const flushLikeIntent = useCallback(async () => {
    if (inFlightRef.current) {
      return;
    }

    if (desiredLikedRef.current === confirmedLikedRef.current) {
      return;
    }

    inFlightRef.current = true;
    setIsSyncing(true);
    const targetLiked = desiredLikedRef.current;
    const formData = new FormData();
    formData.set("poem_id", poemId);
    formData.set("liked", targetLiked ? "1" : "0");

    try {
      await setLikeStateAction(formData);
      confirmedLikedRef.current = targetLiked;
    } catch {
      desiredLikedRef.current = confirmedLikedRef.current;
      setLiked(confirmedLikedRef.current);
    } finally {
      inFlightRef.current = false;

      if (desiredLikedRef.current !== confirmedLikedRef.current) {
        void flushLikeIntent();
      } else {
        setIsSyncing(false);
      }
    }
  }, [poemId]);

  function onToggleLike() {
    const nextLiked = !desiredLikedRef.current;
    desiredLikedRef.current = nextLiked;
    setLiked(nextLiked);

    if (nextLiked) {
      setLikeAnimationToken((token) => token + 1);
    }

    void flushLikeIntent();
  }

  return (
    <div className="flex items-center gap-1 text-sm">
      <LikeButton
        liked={liked}
        animationToken={likeAnimationToken}
        isSyncing={isSyncing}
        onClick={onToggleLike}
      />
      <span className="tabular-nums text-ant-ink/70">{likeCount}</span>
    </div>
  );
}
