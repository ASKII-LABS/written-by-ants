"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { useState } from "react";

type ExistingPoem = {
  id: string;
  title: string;
  content_html: string;
  is_published: boolean;
};

type PoemEditorProps = {
  poem: ExistingPoem | null;
  savePoemAction: (formData: FormData) => Promise<void>;
  deletePoemAction: (formData: FormData) => Promise<void>;
};

type ToolbarButtonProps = {
  label: string;
  isActive?: boolean;
  onClick: () => void;
  disabled?: boolean;
};

function ToolbarButton({ label, isActive = false, onClick, disabled = false }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`cursor-pointer rounded border px-2 py-1 text-sm transition ${
        isActive
          ? "border-ant-primary bg-ant-primary text-ant-paper"
          : "border-ant-border bg-ant-paper text-ant-ink hover:border-ant-primary hover:text-ant-primary"
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {label}
    </button>
  );
}

export function PoemEditor({ poem, savePoemAction, deletePoemAction }: PoemEditorProps) {
  const initialContent = poem?.content_html ?? "<p></p>";
  const [title, setTitle] = useState(poem?.title ?? "");
  const [contentHtml, setContentHtml] = useState(initialContent);
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
          "tiptap prose-poem min-h-[280px] rounded border border-ant-border bg-ant-paper px-4 py-3 text-ant-ink outline-none",
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
          <label htmlFor="title" className="text-sm font-medium text-ant-ink">
            Title
          </label>
          <input
            id="title"
            name="title"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Poem title"
            className="w-full rounded border border-ant-border bg-ant-paper px-3 py-2 text-lg outline-none transition focus:border-ant-primary"
          />
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <ToolbarButton
              label="[B]"
              isActive={editor?.isActive("bold")}
              onClick={() => editor?.chain().focus().toggleBold().run()}
              disabled={!editor?.can().chain().focus().toggleBold().run()}
            />
            <ToolbarButton
              label="[I]"
              isActive={editor?.isActive("italic")}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              disabled={!editor?.can().chain().focus().toggleItalic().run()}
            />
            <ToolbarButton
              label="[U]"
              isActive={editor?.isActive("underline")}
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
              disabled={!editor?.can().chain().focus().toggleUnderline().run()}
            />
            <ToolbarButton
              label="[Left]"
              isActive={editor?.isActive({ textAlign: "left" })}
              onClick={() => editor?.chain().focus().setTextAlign("left").run()}
              disabled={!editor?.can().chain().focus().setTextAlign("left").run()}
            />
            <ToolbarButton
              label="[Center]"
              isActive={editor?.isActive({ textAlign: "center" })}
              onClick={() => editor?.chain().focus().setTextAlign("center").run()}
              disabled={!editor?.can().chain().focus().setTextAlign("center").run()}
            />
            <ToolbarButton
              label="[Right]"
              isActive={editor?.isActive({ textAlign: "right" })}
              onClick={() => editor?.chain().focus().setTextAlign("right").run()}
              disabled={!editor?.can().chain().focus().setTextAlign("right").run()}
            />
          </div>
          <EditorContent editor={editor} />
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
