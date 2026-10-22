/** Plain-text preview of a Markdown note for lists. */
export function noteSnippet(body: string, maxLength = 160): string {
  const text = body
    .replace(/^\s*#{1,6}\s+/gm, '') // headings
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, '') // checklist items
    .replace(/^\s*([-*+]|\d+\.)\s+/gm, '') // list markers
    .replace(/[*_`~>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

export function formatNoteDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
