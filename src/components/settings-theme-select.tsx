"use client";

import { useEffect, useRef, useState } from "react";

import { THEME_LABELS, THEME_OPTIONS, normalizeTheme, type AppTheme } from "@/lib/theme";

type SettingsThemeSelectProps = {
  id: string;
  name: string;
  defaultValue: string | null | undefined;
};

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SettingsThemeSelect({ id, name, defaultValue }: SettingsThemeSelectProps) {
  const initialTheme = normalizeTheme(defaultValue);
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState<AppTheme>(initialTheme);
  const initialThemeRef = useRef<AppTheme>(initialTheme);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const optionTextColor: Record<AppTheme, string> = {
    classic: "#cf4f49",
    plum: "#8f6eb4",
  };

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

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", value);
  }, [value]);

  useEffect(() => {
    const initialThemeAtMount = initialThemeRef.current;
    return () => {
      document.documentElement.setAttribute("data-theme", initialThemeAtMount);
    };
  }, []);

  return (
    <div ref={menuRef} className="relative block w-full">
      <input type="hidden" id={id} name={name} value={value} />
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Theme"
        onClick={() => setIsOpen((current) => !current)}
        className="relative h-10 w-full cursor-pointer rounded border border-ant-border bg-ant-paper px-3 pr-9 text-left text-sm outline-none transition hover:border-ant-primary focus:border-ant-primary"
        style={{ color: optionTextColor[value] }}
      >
        {THEME_LABELS[value]}
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-current opacity-70">
          <ChevronDownIcon />
        </span>
      </button>

      {isOpen ? (
        <div
          role="listbox"
          className="absolute left-0 top-[calc(100%+0.4rem)] z-20 w-full overflow-hidden rounded border border-ant-border bg-ant-paper"
        >
          {THEME_OPTIONS.map((themeOption, index) => (
            <button
              key={themeOption}
              type="button"
              role="option"
              aria-selected={themeOption === value}
              onClick={() => {
                setValue(themeOption);
                setIsOpen(false);
              }}
              className={`block w-full cursor-pointer bg-ant-paper px-3 py-2 text-left text-sm font-medium transition hover:bg-ant-paper-2 ${
                index > 0 ? "border-t border-ant-border" : ""
              } ${
                themeOption === value ? "bg-ant-paper-2" : ""
              }`}
              style={{ color: optionTextColor[themeOption] }}
            >
              {THEME_LABELS[themeOption]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
