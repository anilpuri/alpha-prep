/**
 * Utility helpers — HTML stripping and text normalization.
 */

/**
 * Strip HTML markup and decode common HTML entities, returning plain text.
 * Block-level tags are converted to newlines; list items get a bullet prefix.
 */
export function stripHtml(html: string): string {
  if (!html) return "";

  let text = html;

  // Block-level tags → newline
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n");
  text = text.replace(/<\/div>/gi, "\n");

  // List items → bullet
  text = text.replace(/<li[^>]*>/gi, "• ");

  // Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

  // Collapse multiple spaces (but not newlines)
  text = text.replace(/[^\S\n]+/g, " ");

  // Collapse 3+ consecutive newlines to 2
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}
