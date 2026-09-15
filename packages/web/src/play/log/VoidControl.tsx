import { useRef, useState } from 'react';

import type { VoidPreviewResult } from '@astrolabe/shared';

import { fetchVoidPreview, useVoidEvent } from '../../api/moves.js';
import { Popover } from '../../ui/Popover.js';

import styles from './VoidControl.module.css';

/**
 * Task 6.10, A11: void-and-redo in the UI. The player sees what a void
 * would remove before confirming it — the same two-call shape
 * `previewVoid`/`voidEvent` already give the server (`void-command.ts`).
 * "Redo" is not a separate control: it is opening the same move again from
 * the composer, now that the mis-invoked roll is voided (D-27, confirmed by
 * the design record's own Beat 7 prose).
 */
export function VoidControl({
  campaignId,
  eventId,
}: {
  readonly campaignId: string;
  readonly eventId: string;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<VoidPreviewResult | null>(null);
  const [reason, setReason] = useState('');
  const voidEvent = useVoidEvent(campaignId);

  async function openPreview() {
    setOpen(true);
    setPreview(await fetchVoidPreview(campaignId, eventId));
  }

  async function confirm() {
    await voidEvent.mutateAsync({ eventId, reason: reason.trim() });
    setOpen(false);
    setPreview(null);
    setReason('');
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={styles.trigger}
        onClick={() => void openPreview()}
      >
        Void
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef}>
        <div className={styles.panel}>
          {preview === null && <p>Checking…</p>}
          {preview !== null && !preview.ok && <p className={styles.refusal}>{preview.detail}</p>}
          {preview !== null && preview.ok && (
            <>
              <p className={styles.summaryTitle}>
                This will void {preview.cascaded.length} event
                {preview.cascaded.length === 1 ? '' : 's'}:
              </p>
              <ul className={styles.summaryList}>
                {preview.summary.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
              <input
                type="text"
                className={styles.reason}
                // 10.3: the preview arrives after the popover opens, so its field takes focus itself.
                autoFocus
                placeholder="Why?"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && reason.trim().length > 0 && !voidEvent.isPending) {
                    event.preventDefault();
                    void confirm();
                  }
                }}
              />
              <button
                type="button"
                className={styles.confirm}
                disabled={reason.trim().length === 0 || voidEvent.isPending}
                onClick={() => void confirm()}
              >
                {voidEvent.isPending ? 'Voiding…' : 'Void it'}
              </button>
            </>
          )}
        </div>
      </Popover>
    </>
  );
}
