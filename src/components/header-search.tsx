"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function HeaderSearch() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [mobileQuery, setMobileQuery] = useState(initialQuery);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMobileQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (!isMobileOpen) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsMobileOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMobileOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMobileOpen]);

  return (
    <div ref={containerRef} className="sm:relative">
      <form action="/search" className="relative hidden sm:block">
        <input
          type="search"
          name="q"
          defaultValue={initialQuery}
          placeholder="Search colony"
          aria-label="Search colony"
          className="w-48 rounded border border-ant-border bg-ant-paper px-3 py-1 pr-10 outline-none transition focus:border-ant-primary"
        />
        <button
          type="submit"
          aria-label="Search"
          className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-ant-ink/70 transition hover:text-ant-primary"
        >
          <SearchIcon className="h-4 w-4" />
        </button>
      </form>

      <button
        type="button"
        aria-label="Open search"
        aria-expanded={isMobileOpen}
        onClick={() => setIsMobileOpen((open) => !open)}
        className="cursor-pointer p-1 text-ant-ink/80 transition hover:text-ant-primary sm:hidden"
      >
        <SearchIcon className="h-4 w-4" />
      </button>

      <div
        className={`absolute inset-x-0 top-full z-30 overflow-hidden bg-ant-paper-2/90 backdrop-blur-md px-4 transition-all duration-200 ease-out sm:hidden ${
          isMobileOpen
            ? "max-h-24 translate-y-0 border-b border-ant-border py-2 opacity-100"
            : "pointer-events-none max-h-0 -translate-y-1 border-b-0 py-0 opacity-0"
        }`}
      >
        <form action="/search" className="relative" onSubmit={() => setIsMobileOpen(false)}>
          <input
            type="search"
            name="q"
            value={mobileQuery}
            onChange={(event) => setMobileQuery(event.target.value)}
            autoFocus={isMobileOpen}
            placeholder="Search colony"
            aria-label="Search colony"
            className="w-full rounded border border-ant-border bg-ant-paper px-3 py-2 outline-none transition focus:border-ant-primary"
          />
          <button type="submit" className="sr-only">
            Search
          </button>
        </form>
      </div>
    </div>
  );
}
