"use client";

import { useState } from "react";

import { CommentsTriggerButton } from "@/components/comments-trigger-button";
import { MobileCommentsPrefetch } from "@/components/mobile-comments-prefetch";
import { PoemCardMenu } from "@/components/poem-card-menu";
import { PoemLikeControl } from "@/components/poem-like-control";
import { getPoemFontFamily } from "@/lib/poem-fonts";
import { formatDate } from "@/lib/utils";

type ProfilePoem = {
  id: string;
  title: string;
  safe_content_html: string;
  title_font: string | null;
  content_font: string | null;
  created_at: string;
  updated_at: string;
  comment_count: number;
  like_count: number;
  liked_by_user: boolean;
};

type ProfilePoemTabsProps = {
  publishedPoems: ProfilePoem[];
  draftPoems: ProfilePoem[];
  deletePoemAction: (formData: FormData) => Promise<void>;
  initialTab?: "published" | "drafts";
};

export function ProfilePoemTabs({
  publishedPoems,
  draftPoems,
  deletePoemAction,
  initialTab = "published",
}: ProfilePoemTabsProps) {
  const [activeTab, setActiveTab] = useState<"published" | "drafts">(initialTab);
  const visiblePoems = activeTab === "published" ? publishedPoems : draftPoems;

  return (
    <div className="mt-5 space-y-4">
      <div className="flex items-center gap-2 border-b border-ant-border pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("published")}
          className={`cursor-pointer rounded border px-3 py-1 text-sm transition ${
            activeTab === "published"
              ? "border-ant-primary bg-ant-primary text-ant-paper"
              : "border-ant-border text-ant-ink hover:border-ant-primary hover:text-ant-primary"
          }`}
        >
          Published ({publishedPoems.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("drafts")}
          className={`cursor-pointer rounded border px-3 py-1 text-sm transition ${
            activeTab === "drafts"
              ? "border-ant-primary bg-ant-primary text-ant-paper"
              : "border-ant-border text-ant-ink hover:border-ant-primary hover:text-ant-primary"
          }`}
        >
          Drafts ({draftPoems.length})
        </button>
      </div>

      {visiblePoems.length === 0 ? (
        <p className="text-sm text-ant-ink/70">
          {activeTab === "published" ? "No published poems yet." : "No drafts yet."}
        </p>
      ) : (
        <div className="space-y-4">
          {visiblePoems.map((poem) => (
            <article
              key={poem.id}
              id={`poem-${poem.id}`}
              className="relative rounded border border-ant-border bg-ant-paper p-5"
            >
              <MobileCommentsPrefetch poemId={poem.id} />
              <PoemCardMenu
                poemId={poem.id}
                poemTitle={poem.title}
                isOwner
                deletePoemAction={deletePoemAction}
              />

              <h3
                className="pr-10 font-serif text-2xl text-ant-primary"
                style={{ fontFamily: getPoemFontFamily(poem.title_font) }}
              >
                {poem.title}
              </h3>
              <p className="mt-1 text-xs text-ant-ink/70">
                {activeTab === "published"
                  ? `Published on ${formatDate(poem.created_at)}`
                  : `Updated ${formatDate(poem.updated_at)}`}
              </p>

              <section
                className="prose-poem mt-3 text-ant-ink/90"
                style={{ fontFamily: getPoemFontFamily(poem.content_font) }}
                dangerouslySetInnerHTML={{ __html: poem.safe_content_html }}
              />

              <div className="mt-4 flex items-center gap-2 text-sm">
                {activeTab === "published" ? (
                  <>
                    <PoemLikeControl
                      poemId={poem.id}
                      initialLiked={poem.liked_by_user}
                      initialLikeCount={poem.like_count}
                    />
                    <CommentsTriggerButton
                      poemId={poem.id}
                      commentCount={poem.comment_count}
                      iconClassName="h-4 w-4"
                    />
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
