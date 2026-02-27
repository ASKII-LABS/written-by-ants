export const DEFAULT_THEME = "classic" as const;

export const THEME_OPTIONS = ["classic", "plum"] as const;

export type AppTheme = (typeof THEME_OPTIONS)[number];

const THEME_SET = new Set<string>(THEME_OPTIONS);

export const THEME_LABELS: Record<AppTheme, string> = {
  classic: "Classic",
  plum: "Plum",
};

export function normalizeTheme(value: string | null | undefined): AppTheme {
  if (value && THEME_SET.has(value)) {
    return value as AppTheme;
  }

  return DEFAULT_THEME;
}

type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
};

export function isMissingThemeColumnError(error: PostgrestLikeError | null | undefined): boolean {
  if (!error) {
    return false;
  }

  if (error.code === "42703" || error.code === "PGRST204") {
    return true;
  }

  return (error.message ?? "").toLowerCase().includes("theme");
}
