import { useEffect, useRef, type RefObject } from 'react';

/**
 * Keyboard play (task 10.3, §10: keyboard navigable).
 *
 * Where focus lands when the composer's step changes or a popover opens.
 * `<dialog>` traps focus and closes on Escape, but an unmounted one can't
 * hand focus back, so `Drawer` does that itself.
 */

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** Where focus should land inside `root`: its marked target, else its first focusable control. */
export function focusTarget(root: ParentNode): HTMLElement | null {
  return (
    root.querySelector<HTMLElement>('[data-focus-target]') ??
    root.querySelector<HTMLElement>(FOCUSABLE)
  );
}

/**
 * Each move-flow step replaces the one before it in the composer, so the
 * control a keyboard player just used (Roll, Done, a method) is removed
 * from the page and focus would fall back to the top of the document. When
 * that happens inside `ref`, focus moves to the new step's target instead.
 * Focus anywhere else is left alone.
 */
export function useFocusHandoff(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = ref.current;
    if (root === null) {
      return;
    }
    // Removing a focused element fires no blur, so watch for the removal itself.
    let lastFocused: HTMLElement | null = null;
    const onFocusIn = (event: FocusEvent) => {
      lastFocused = event.target instanceof HTMLElement ? event.target : null;
    };
    const observer = new MutationObserver(() => {
      const active = document.activeElement;
      if (
        lastFocused !== null &&
        !lastFocused.isConnected &&
        (active === null || active === document.body)
      ) {
        lastFocused = null;
        focusTarget(root)?.focus();
      }
    });
    root.addEventListener('focusin', onFocusIn);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      root.removeEventListener('focusin', onFocusIn);
    };
  }, [ref]);
}

/**
 * Moving between the views of one screen replaces the page under the
 * keyboard, and focus would fall to the top of the document (10.4, found in
 * the browser pass). When `viewKey` changes, focus moves to the new view's
 * heading inside `ref`: its first `h2`, else its first `h1`. Not on the first
 * render, where the browser's own starting point is right.
 */
export function useFocusOnViewChange(ref: RefObject<HTMLElement | null>, viewKey: string): void {
  const previous = useRef(viewKey);
  useEffect(() => {
    if (previous.current === viewKey) return;
    previous.current = viewKey;
    const heading =
      ref.current?.querySelector<HTMLElement>('h2') ?? ref.current?.querySelector('h1');
    if (heading === null || heading === undefined) return;
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus();
  }, [ref, viewKey]);
}
