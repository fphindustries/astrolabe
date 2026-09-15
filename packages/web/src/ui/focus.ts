import { useEffect, type RefObject } from 'react';

/**
 * Keyboard play (task 10.3, §10: keyboard navigable).
 *
 * Two small rules the platform doesn't give for free. `<dialog>` already
 * traps focus, closes on Escape and hands focus back (see `Drawer`); these
 * cover what the composer and popovers do instead.
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
