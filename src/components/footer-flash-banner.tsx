"use client";

import { useEffect, useState } from "react";

type FooterFlashBannerProps = {
  message: string;
  durationMs?: number;
  clearSearchParam?: string;
};

export function FooterFlashBanner({
  message,
  durationMs = 4200,
  clearSearchParam,
}: FooterFlashBannerProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (clearSearchParam) {
      const url = new URL(window.location.href);
      if (url.searchParams.has(clearSearchParam)) {
        url.searchParams.delete(clearSearchParam);
        const nextUrl = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState({}, "", nextUrl);
      }
    }

    const timeoutId = window.setTimeout(() => {
      setVisible(false);
    }, durationMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [clearSearchParam, durationMs]);

  if (!visible) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-4 z-[70] px-4">
      <div
        role="status"
        aria-live="polite"
        className="mx-auto w-full max-w-5xl rounded border border-ant-primary bg-ant-paper-2/95 px-4 py-2 text-center text-sm font-medium text-ant-primary shadow-lg backdrop-blur"
      >
        {message}
      </div>
    </div>
  );
}
