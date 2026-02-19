"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { signOutAction } from "@/app/actions";

type HeaderUserMenuProps = {
  poetName: string;
};

function LogoutButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="block w-full cursor-pointer bg-ant-primary px-3 py-2 text-left text-ant-paper transition hover:bg-ant-accent disabled:cursor-wait disabled:opacity-80"
    >
      {pending ? "Logging out..." : "Logout"}
    </button>
  );
}

export function HeaderUserMenu({ poetName }: HeaderUserMenuProps) {
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
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        className="cursor-pointer rounded-full border border-ant-border px-3 py-1 transition hover:border-ant-primary hover:text-ant-primary"
      >
        {poetName}
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-[calc(100%+0.4rem)] z-20 min-w-36 overflow-hidden rounded border border-ant-border bg-ant-paper shadow-sm">
          <Link
            href="/profile"
            onClick={() => setIsOpen(false)}
            className="block px-3 py-2 transition hover:bg-ant-paper-2 hover:text-ant-primary"
          >
            Profile
          </Link>
          <Link
            href="/settings"
            onClick={() => setIsOpen(false)}
            className="block border-t border-ant-border px-3 py-2 transition hover:bg-ant-paper-2 hover:text-ant-primary"
          >
            Settings
          </Link>
          <form action={signOutAction} className="border-t border-ant-border">
            <LogoutButton />
          </form>
        </div>
      ) : null}
    </div>
  );
}
