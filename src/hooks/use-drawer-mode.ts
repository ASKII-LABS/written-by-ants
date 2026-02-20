"use client";

import { useMediaQuery } from "@/hooks/use-media-query";

export function useDrawerMode(): "mobile" | "desktop" {
  const isMobile = useMediaQuery("(max-width: 768px)");
  return isMobile ? "mobile" : "desktop";
}
