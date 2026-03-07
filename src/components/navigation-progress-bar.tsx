"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const NAVIGATION_PROGRESS_START_EVENT = "written-by-ants:navigation-progress-start";

export function startNavigationProgress() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(NAVIGATION_PROGRESS_START_EVENT));
}

export function NavigationProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const onStart = () => {
      setIsVisible(true);
    };

    window.addEventListener(NAVIGATION_PROGRESS_START_EVENT, onStart);
    return () => {
      window.removeEventListener(NAVIGATION_PROGRESS_START_EVENT, onStart);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsVisible(false);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [pathname, searchParamsKey]);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    const timer = window.setTimeout(() => {
      setIsVisible(false);
    }, 8000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isVisible]);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 top-0 z-[80] h-1 overflow-hidden transition-opacity duration-200 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="h-full w-[36%] bg-gradient-to-r from-ant-accent via-ant-primary to-ant-accent animate-settings-save-progress" />
    </div>
  );
}
