const LINK = /\[([^\]]+)\]\([^)]*\)/g;

/** `When you [Face Danger](id:move:adventure/face-danger)` → `When you Face Danger`. */
export function withoutLinks(text: string): string {
  return text.replace(LINK, '$1');
}
