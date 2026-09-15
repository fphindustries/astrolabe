/** Ctrl+Enter (⌘+Enter on a Mac): send what was typed without reaching for the button (10.3). */
export function isSubmitChord(event: {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}): boolean {
  return event.key === 'Enter' && (event.ctrlKey || event.metaKey);
}
