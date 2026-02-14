import sanitizeHtml from "sanitize-html";

export function sanitizePoemHtml(contentHtml: string): string {
  return sanitizeHtml(contentHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags,
    allowedAttributes: {
      a: ["href", "target", "rel"],
      p: ["style"],
    },
    allowedStyles: {
      p: {
        "text-align": [/^(left|center|right)$/],
      },
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer",
      }),
    },
  });
}
