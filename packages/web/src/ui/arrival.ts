/**
 * Whether the screen now showing was reached by an in-app navigation (D-209).
 *
 * `navigate()` notes the path it is going to. The first screen that renders a
 * heading at that path takes the note and moves focus there, so a keyboard user
 * lands on the new page rather than at the top of the document. A full page load
 * and back/forward (`popstate`) note nothing: the browser's own starting point is
 * right for them.
 *
 * The note is for a path, not a moment, because the screen that owns the heading
 * can mount later than the navigation (the campaign dispatcher shows a heading-less
 * loading line first). A note nobody takes goes stale harmlessly: the next
 * navigation replaces it and the next back/forward clears it.
 */

let pending: string | null = null;

/** The path part of a URL, without its query or fragment. */
export function pathOf(to: string): string {
  return to.split(/[?#]/)[0] ?? to;
}

export function noteArrival(to: string): void {
  pending = pathOf(to);
}

export function clearArrival(): void {
  pending = null;
}

/** True, once, for the first caller at the path `navigate()` went to. */
export function takeArrival(pathname: string): boolean {
  if (pending === null || pending !== pathname) return false;
  pending = null;
  return true;
}
