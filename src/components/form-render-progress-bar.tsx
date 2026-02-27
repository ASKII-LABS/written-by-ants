"use client";

import { useFormStatus } from "react-dom";

export function FormRenderProgressBar() {
  const { pending } = useFormStatus();

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 top-0 z-[70] h-1 overflow-hidden transition-opacity duration-200 ${
        pending ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="h-full w-[36%] bg-gradient-to-r from-ant-accent via-ant-primary to-ant-accent animate-settings-save-progress" />
    </div>
  );
}
