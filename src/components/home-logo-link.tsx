"use client";

import Link from "next/link";
import type { MouseEvent } from "react";

import { startNavigationProgress } from "@/components/navigation-progress-bar";

export function HomeLogoLink() {
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    startNavigationProgress();
  }

  return (
    <Link
      href="/"
      onClick={onClick}
      className="font-serif text-2xl font-semibold tracking-tight text-ant-primary transition hover:text-ant-accent"
    >
      Written by Ants
    </Link>
  );
}
