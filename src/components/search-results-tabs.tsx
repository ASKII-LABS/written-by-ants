"use client";

import Link from "next/link";
import { useState } from "react";

import { formatDate } from "@/lib/utils";

type SearchPoemResult = {
  id: string;
  title: string;
  safe_content_html: string;
  author_id: string;
  author_name: string;
  created_at: string;
};

type SearchPoetResult = {
  id: string;
  display_name: string;
  bio: string | null;
};

type SearchResultsTabsProps = {
  poemResults: SearchPoemResult[];
  poetResults: SearchPoetResult[];
  currentUserId?: string;
};

export function SearchResultsTabs({ poemResults, poetResults, currentUserId }: SearchResultsTabsProps) {
  const [activeTab, setActiveTab] = useState<"poems" | "poets">("poems");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-ant-border pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("poems")}
          className={`cursor-pointer rounded border px-3 py-1 text-sm transition ${
            activeTab === "poems"
              ? "border-ant-primary bg-ant-primary text-ant-paper"
              : "border-ant-border text-ant-ink hover:border-ant-primary hover:text-ant-primary"
          }`}
        >
          Poems ({poemResults.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("poets")}
          className={`cursor-pointer rounded border px-3 py-1 text-sm transition ${
            activeTab === "poets"
              ? "border-ant-primary bg-ant-primary text-ant-paper"
              : "border-ant-border text-ant-ink hover:border-ant-primary hover:text-ant-primary"
          }`}
        >
          Poets ({poetResults.length})
        </button>
      </div>

      {activeTab === "poems" ? (
        poemResults.length === 0 ? (
          <div className="rounded border border-ant-border bg-ant-paper-2 p-5 text-sm text-ant-ink/80">
            No poems matched your search.
          </div>
        ) : (
          <div className="space-y-4">
            {poemResults.map((poem) => {
              const authorHref = currentUserId === poem.author_id ? "/profile" : `/poet/${poem.author_id}`;

              return (
                <article key={poem.id} className="rounded border border-ant-border bg-ant-paper-2 p-5">
                  <h2 className="font-serif text-2xl text-ant-primary">
                    <Link href={`/poem/${poem.id}`} className="transition hover:text-ant-accent">
                      {poem.title}
                    </Link>
                  </h2>
                  <p className="mt-1 text-xs text-ant-ink/70">
                    by{" "}
                    <Link href={authorHref} className="text-ant-primary transition hover:underline">
                      {poem.author_name}
                    </Link>{" "}
                    on {formatDate(poem.created_at)}
                  </p>

                  <section
                    className="prose-poem mt-3 text-ant-ink/90"
                    dangerouslySetInnerHTML={{ __html: poem.safe_content_html }}
                  />
                </article>
              );
            })}
          </div>
        )
      ) : poetResults.length === 0 ? (
        <div className="rounded border border-ant-border bg-ant-paper-2 p-5 text-sm text-ant-ink/80">
          No poets matched your search.
        </div>
      ) : (
        <div className="space-y-3">
          {poetResults.map((poet) => {
            const poetHref = currentUserId === poet.id ? "/profile" : `/poet/${poet.id}`;

            return (
              <article key={poet.id} className="rounded border border-ant-border bg-ant-paper-2 p-4">
                <h2 className="font-serif text-2xl text-ant-primary">
                  <Link href={poetHref} className="transition hover:text-ant-accent">
                    {poet.display_name}
                  </Link>
                </h2>
                <p className="mt-1 whitespace-pre-line text-sm text-ant-ink/80">
                  {poet.bio && poet.bio.trim().length > 0 ? poet.bio : "No bio yet."}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
