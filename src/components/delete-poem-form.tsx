"use client";

type DeletePoemFormProps = {
  poemId: string;
  deletePoemAction: (formData: FormData) => Promise<void>;
  className?: string;
};

export function DeletePoemForm({ poemId, deletePoemAction, className }: DeletePoemFormProps) {
  return (
    <form
      action={deletePoemAction}
      onSubmit={(event) => {
        if (!confirm("Delete this poem? This action cannot be undone.")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="poem_id" value={poemId} />
      <button type="submit" className={className}>
        Delete
      </button>
    </form>
  );
}
