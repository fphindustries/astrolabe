import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';

import styles from './Popover.module.css';

/**
 * A lightweight detail popover (§8, D-96: "clicking … a clock, a vow …
 * opens a drawer or popover"). Native Popover API in `auto` mode, so
 * outside-click and Escape dismiss it the same way `<dialog>` gives
 * `Drawer` its dismissal for free — no component library, matching that
 * primitive's own convention.
 *
 * Positioned from the trigger's own bounding rect rather than CSS anchor
 * positioning, which isn't universally supported yet. Nothing here needs to
 * be pixel-perfect before the visual pass (task 10.1/10.2).
 */
export function Popover({
  open,
  onClose,
  anchorRef,
  children,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly anchorRef: RefObject<HTMLElement | null>;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const popover = ref.current;
    if (popover === null) {
      return;
    }
    const isOpen = popover.matches(':popover-open');
    if (open && !isOpen) {
      const anchor = anchorRef.current;
      if (anchor !== null) {
        const rect = anchor.getBoundingClientRect();
        popover.style.top = `${rect.bottom + 4}px`;
        popover.style.left = `${rect.left}px`;
      }
      popover.showPopover();
    } else if (!open && isOpen) {
      popover.hidePopover();
    }
  }, [open, anchorRef]);

  return (
    <div
      ref={ref}
      popover="auto"
      className={styles.popover}
      onToggle={(event) => {
        if (event.newState === 'closed') {
          onClose();
        }
      }}
    >
      {children}
    </div>
  );
}
