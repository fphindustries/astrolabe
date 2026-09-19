import { useEffect, useRef, useState } from 'react';

import { guarded } from '../ui/guarded.js';

import styles from './LaunchConfirmDialog.module.css';

/**
 * The confirmation for the one irreversible step in Campaign Launch (A38, A40).
 *
 * Two deliberate choices. **Cancel takes initial focus**, because the action
 * cannot be undone and a stray Enter should not launch a campaign. And the
 * `commandId` is minted **once, when the dialog opens**, so a double press is
 * the same command arriving twice rather than a second activation — the
 * server's idempotency key is doing the work the disabled button only appears
 * to do.
 *
 * Native `<dialog>` with `showModal`, as `ui/Drawer` does: the focus trap, the
 * Escape key and the inert background come from the platform rather than from
 * a hand-rolled version of them.
 */
export function LaunchConfirmDialog({
  campaignName,
  pending,
  onCancel,
  onConfirm,
}: {
  readonly campaignName: string;
  readonly pending: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: (commandId: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [commandId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    // The dialog unmounts rather than closes, so the platform's own return of
    // focus never runs: put it back on whatever opened the dialog (10.4).
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = ref.current;
    if (dialog !== null && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    }
    return () => {
      if (opener?.isConnected === true) opener.focus();
    };
  }, []);

  return (
    <dialog ref={ref} className={styles.dialog} onCancel={onCancel} onClose={onCancel}>
      <h2 className={styles.heading}>Launch {campaignName}?</h2>
      <p className={styles.body}>
        Activation is one way. Session 1 begins and the opening scene is established.
      </p>
      <p className={styles.body}>
        After this the Campaign Launch workspace is no longer offered. Later corrections are
        explicit amendments, with their history visible.
      </p>
      <div className={styles.actions}>
        <button ref={cancelRef} type="button" className={styles.secondary} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.primary}
          {...guarded({ busy: pending, onClick: () => onConfirm(commandId) })}
        >
          {pending ? 'Launching…' : 'Launch campaign'}
        </button>
      </div>
    </dialog>
  );
}
