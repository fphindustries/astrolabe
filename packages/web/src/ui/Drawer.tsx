import { useEffect, useRef, type ReactNode } from 'react';

import styles from './Drawer.module.css';

/**
 * A drawer over the play screen (§8: "clicking a crew card, an NPC, a
 * clock, a vow, a move name, or an asset chip opens a drawer or popover.
 * Play never navigates away.").
 *
 * Wraps native `<dialog>` via `showModal()` rather than a component
 * library (D-96): focus trapping, Esc-to-close, backdrop click, an inert
 * background, and top-layer stacking all come from the platform. Focus
 * returns to whatever opened it when the drawer goes away (10.3).
 */
export function Drawer({
  open,
  onClose,
  title,
  side = 'right',
  children,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly side?: 'left' | 'right';
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  // 10.3: drawers are unmounted rather than closed, and a removed dialog
  // can't hand focus back itself, so the opener gets it back here. Declared
  // first, so it reads the opener before `showModal()` moves focus.
  useEffect(() => {
    const opener = document.activeElement;
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus();
      }
    };
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.drawer}
      data-side={side}
      onClose={onClose}
      onCancel={onClose}
      aria-label={title}
    >
      <div className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
