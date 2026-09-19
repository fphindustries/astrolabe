/**
 * The pure half of the error summary (task 4.2).
 *
 * An accessible summary is a list of links that move focus to the field each
 * one is about, which only works if the link's fragment and the field's `id`
 * are derived from one thing. Both come from the problem's `path`, here, so
 * they cannot drift apart as a form grows.
 */

export interface SummaryEntry {
  readonly id: string;
  readonly message: string;
  readonly href: string;
}

/**
 * A DOM id for the field a problem is about.
 *
 * A `path` looks like `characters.abc-123.backgroundVow`, so it is not a legal
 * fragment on its own. Every run of characters outside the safe set collapses
 * to one dash, and the prefix keeps these from colliding with any other id on
 * the page.
 */
export function fieldAnchorId(path: string): string {
  const slug = path.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return `launch-field-${slug === '' ? 'unknown' : slug}`;
}

export function summaryEntries(
  problems: readonly { readonly path: string; readonly message: string }[],
): readonly SummaryEntry[] {
  return problems.map((problem) => {
    const id = fieldAnchorId(problem.path);
    return { id, message: problem.message, href: `#${id}` };
  });
}
