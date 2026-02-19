"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { type ReactNode, useEffect, useRef, useState } from "react";

import {
  DEFAULT_POEM_FONT,
  POEM_FONT_OPTIONS,
  getPoemFontFamily,
  normalizePoemFont,
} from "@/lib/poem-fonts";

type ExistingPoem = {
  id: string;
  title: string;
  content_html: string;
  is_published: boolean;
  title_font: string | null;
  content_font: string | null;
};

type PoemEditorProps = {
  poem: ExistingPoem | null;
  savePoemAction: (formData: FormData) => Promise<void>;
  deletePoemAction: (formData: FormData) => Promise<void>;
};

type ToolbarButtonProps = {
  ariaLabel: string;
  children: ReactNode;
  isActive?: boolean;
  onClick: () => void;
  disabled?: boolean;
};

type FontSelectProps = {
  id: string;
  name: string;
  value: string;
  ariaLabel: string;
  onChange: (nextValue: string) => void;
};

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FontSelect({ id, name, value, ariaLabel, onChange }: FontSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div ref={menuRef} className="relative inline-block">
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        onClick={() => setIsOpen((current) => !current)}
        className="relative h-8 min-w-36 max-w-full cursor-pointer rounded-full border border-ant-border bg-ant-paper px-3 pr-9 text-left text-sm text-ant-ink outline-none transition hover:border-ant-primary focus:border-ant-primary"
        style={{ fontFamily: getPoemFontFamily(value) }}
      >
        {value}
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ant-ink/70">
          <ChevronDownIcon />
        </span>
      </button>

      {isOpen ? (
        <div
          id={`${id}-menu`}
          role="listbox"
          className="absolute left-0 top-[calc(100%+0.4rem)] z-20 min-w-44 overflow-hidden rounded border border-ant-border bg-ant-paper shadow-sm"
        >
          {POEM_FONT_OPTIONS.map((fontOption, index) => (
            <button
              key={fontOption}
              type="button"
              role="option"
              aria-selected={fontOption === value}
              onClick={() => {
                onChange(fontOption);
                setIsOpen(false);
              }}
              className={`block w-full cursor-pointer px-3 py-2 text-left transition hover:bg-ant-paper-2 hover:text-ant-primary ${
                index > 0 ? "border-t border-ant-border" : ""
              } ${fontOption === value ? "bg-ant-paper-2 text-ant-primary" : ""}`}
              style={{ fontFamily: getPoemFontFamily(fontOption) }}
            >
              {fontOption}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ToolbarButton({
  ariaLabel,
  children,
  isActive = false,
  onClick,
  disabled = false,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={`flex h-8 min-w-8 cursor-pointer items-center justify-center rounded border px-2 text-sm transition ${
        isActive
          ? "border-ant-primary bg-ant-primary text-ant-paper"
          : "border-ant-border bg-ant-paper text-ant-ink hover:border-ant-primary hover:text-ant-primary"
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {children}
    </button>
  );
}

export function PoemEditor({ poem, savePoemAction, deletePoemAction }: PoemEditorProps) {
  const initialContent = poem?.content_html ?? "<p></p>";
  const [title, setTitle] = useState(poem?.title ?? "");
  const [contentHtml, setContentHtml] = useState(initialContent);
  const [titleFont, setTitleFont] = useState(normalizePoemFont(poem?.title_font ?? DEFAULT_POEM_FONT));
  const [contentFont, setContentFont] = useState(
    normalizePoemFont(poem?.content_font ?? DEFAULT_POEM_FONT),
  );
  const draftIntent = poem?.is_published ? "unpublish" : "save_draft";
  const draftLabel = poem?.is_published ? "Unpublish (Save Draft)" : "Save Draft";

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Underline,
      TextAlign.configure({
        types: ["paragraph"],
      }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class:
          "tiptap poem-content min-h-[280px] rounded border border-ant-border bg-ant-paper px-4 py-3 text-ant-ink outline-none",
      },
    },
    onUpdate: ({ editor: activeEditor }) => {
      setContentHtml(activeEditor.getHTML());
    },
  });

  return (
    <div className="space-y-5">
      <form action={savePoemAction} className="space-y-4 rounded border border-ant-border bg-ant-paper-2 p-4">
        {poem?.id ? <input type="hidden" name="poem_id" value={poem.id} /> : null}

        <div className="space-y-2">
          <label htmlFor="title" className="block text-sm font-medium text-ant-ink">
            Title
          </label>
          <FontSelect
            id="title_font"
            name="title_font"
            value={titleFont}
            onChange={(nextValue) => setTitleFont(normalizePoemFont(nextValue))}
            ariaLabel="Title font"
          />
          <input
            id="title"
            name="title"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Poem title"
            className="w-full rounded border border-ant-border bg-ant-paper px-3 py-2 text-lg outline-none transition focus:border-ant-primary"
            style={{ fontFamily: getPoemFontFamily(titleFont) }}
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-ant-ink">Content</p>
          <div className="flex flex-wrap items-center gap-2">
            <FontSelect
              id="content_font"
              name="content_font"
              value={contentFont}
              onChange={(nextValue) => setContentFont(normalizePoemFont(nextValue))}
              ariaLabel="Content font"
            />
            <ToolbarButton
              ariaLabel="Bold"
              isActive={editor?.isActive("bold")}
              onClick={() => editor?.chain().focus().toggleBold().run()}
              disabled={!editor?.can().chain().focus().toggleBold().run()}
            >
              <span className="text-base font-bold leading-none">B</span>
            </ToolbarButton>
            <ToolbarButton
              ariaLabel="Italic"
              isActive={editor?.isActive("italic")}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              disabled={!editor?.can().chain().focus().toggleItalic().run()}
            >
              <span className="text-base italic leading-none">I</span>
            </ToolbarButton>
            <ToolbarButton
              ariaLabel="Underline"
              isActive={editor?.isActive("underline")}
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
              disabled={!editor?.can().chain().focus().toggleUnderline().run()}
            >
              <span className="text-base underline leading-none">U</span>
            </ToolbarButton>
            <ToolbarButton
              ariaLabel="Align left"
              isActive={editor?.isActive({ textAlign: "left" })}
              onClick={() => editor?.chain().focus().setTextAlign("left").run()}
              disabled={!editor?.can().chain().focus().setTextAlign("left").run()}
            >
              <span className="leading-none">Left</span>
            </ToolbarButton>
            <ToolbarButton
              ariaLabel="Align center"
              isActive={editor?.isActive({ textAlign: "center" })}
              onClick={() => editor?.chain().focus().setTextAlign("center").run()}
              disabled={!editor?.can().chain().focus().setTextAlign("center").run()}
            >
              <span className="leading-none">Center</span>
            </ToolbarButton>
            <ToolbarButton
              ariaLabel="Align right"
              isActive={editor?.isActive({ textAlign: "right" })}
              onClick={() => editor?.chain().focus().setTextAlign("right").run()}
              disabled={!editor?.can().chain().focus().setTextAlign("right").run()}
            >
              <span className="leading-none">Right</span>
            </ToolbarButton>
          </div>
          <EditorContent editor={editor} style={{ fontFamily: getPoemFontFamily(contentFont) }} />
          <input type="hidden" name="content_html" value={contentHtml} />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            name="intent"
            value={draftIntent}
            className="cursor-pointer rounded border border-ant-border px-3 py-2 text-sm text-ant-ink transition hover:border-ant-primary hover:text-ant-primary"
          >
            {draftLabel}
          </button>
          <button
            type="submit"
            name="intent"
            value="publish"
            className="cursor-pointer rounded border border-ant-primary bg-ant-primary px-3 py-2 text-sm font-medium text-ant-paper transition hover:bg-ant-accent"
          >
            Publish
          </button>
        </div>
      </form>

      {poem?.id ? (
        <form
          action={deletePoemAction}
          onSubmit={(event) => {
            if (!confirm("Delete this poem? This action cannot be undone.")) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="poem_id" value={poem.id} />
          <button
            type="submit"
            className="cursor-pointer rounded border border-ant-border px-3 py-2 text-sm text-ant-ink transition hover:border-ant-primary hover:text-ant-primary"
          >
            Delete poem
          </button>
        </form>
      ) : null}
    </div>
  );
}
