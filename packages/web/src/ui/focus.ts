import { useEffect, useRef, type RefObject } from 'react';

import { takeArrival } from './arrival.js';

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

/** Focus the first heading matching `selectors` in `root` (or `root` itself), in order. */
function focusHeading(root: HTMLElement | null, selectors: readonly string[]): void {
  if (root === null) return;
  for (const selector of selectors) {
    const heading = root.matches(selector) ? root : root.querySelector<HTMLElement>(selector);
    if (heading === null) continue;
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus();
    return;
  }
}

/**
 * Moving between the views of one screen replaces the page under the
 * keyboard, and focus would fall to the top of the document (10.4, found in
 * the browser pass). When `viewKey` changes, focus moves to the new view's
 * heading inside `ref`: its first `h2`, else its first `h1`.
 *
 * The first render is a full page load, where the browser's own starting point
 * is right, or an arrival by in-app navigation, where it is not (D-209): the
 * page is new and focus has fallen to the document. Only the arrival moves focus.
 */
export function useFocusOnViewChange(ref: RefObject<HTMLElement | null>, viewKey: string): void {
  const previous = useRef<string | null>(null);
  useEffect(() => {
    const first = previous.current === null;
    const changed = !first && previous.current !== viewKey;
    previous.current = viewKey;
    const arrived = takeArrival(location.pathname);
    if (changed || (first && arrived)) focusHeading(ref.current, ['h2', 'h1']);
  }, [ref, viewKey]);
}

/**
 * A screen reached by in-app navigation takes focus on its heading (D-209).
 * `ref` is the screen's container, or the `h1` itself. Nothing moves on a full
 * page load or on back/forward. A screen whose heading appears after it mounts
 * calls this from the component that renders the heading.
 */
export function useFocusOnArrival(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (takeArrival(location.pathname)) focusHeading(ref.current, ['h1']);
  }, [ref]);
}
