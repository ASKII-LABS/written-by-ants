"use client";

import { useFormStatus } from "react-dom";

import { FormRenderProgressBar } from "@/components/form-render-progress-bar";

export function SettingsSaveControls() {
  const { pending } = useFormStatus();

  return (
    <>
      <FormRenderProgressBar />

      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer rounded border border-ant-primary bg-ant-primary px-4 py-2 font-medium text-ant-paper transition hover:bg-ant-accent disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "Saving changes..." : "Save changes"}
      </button>
    </>
  );
}
