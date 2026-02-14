export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function poemSnippet(contentHtml: string, maxLength = 180): string {
  const plain = stripHtml(contentHtml);

  if (plain.length <= maxLength) {
    return plain;
  }

  return `${plain.slice(0, maxLength).trim()}...`;
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
