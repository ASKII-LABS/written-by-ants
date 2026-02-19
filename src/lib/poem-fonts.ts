export const DEFAULT_POEM_FONT = "Inter" as const;

export const POEM_FONT_OPTIONS = [
  "Inter",
  "Playfair Display",
  "Lora",
  "Georgia",
  "Times New Roman",
  "Courier New",
] as const;

export type PoemFont = (typeof POEM_FONT_OPTIONS)[number];

const POEM_FONT_SET = new Set<string>(POEM_FONT_OPTIONS);

const POEM_FONT_FAMILY: Record<PoemFont, string> = {
  Inter: "var(--font-body), Inter, sans-serif",
  "Playfair Display": 'var(--font-playfair), "Playfair Display", Georgia, serif',
  Lora: "var(--font-heading), Lora, Georgia, serif",
  Georgia: 'Georgia, "Times New Roman", serif',
  "Times New Roman": '"Times New Roman", Times, serif',
  "Courier New": '"Courier New", Courier, monospace',
};

export function normalizePoemFont(value: string | null | undefined): PoemFont {
  if (value && POEM_FONT_SET.has(value)) {
    return value as PoemFont;
  }

  return DEFAULT_POEM_FONT;
}

export function getPoemFontFamily(value: string | null | undefined): string {
  return POEM_FONT_FAMILY[normalizePoemFont(value)];
}

type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
};

export function isMissingPoemFontColumnsError(error: PostgrestLikeError | null | undefined): boolean {
  if (!error || error.code !== "42703") {
    return false;
  }

  const message = (error.message ?? "").toLowerCase();
  return message.includes("title_font") || message.includes("content_font");
}
