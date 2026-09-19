import type { LaunchSectionStatus } from '@astrolabe/rules';

import { STATUS_TEXT } from './dashboard.js';
import styles from './SectionStatusChip.module.css';

/**
 * A section's status: a shape and a word, never a colour alone (§10).
 *
 * The glyph is decorative and hidden from assistive technology — the word
 * beside it is the status, so a screen reader hears "Complete" rather than
 * "check mark Complete".
 */
const GLYPHS: Readonly<Record<LaunchSectionStatus, string>> = {
  not_started: '○',
  in_progress: '◐',
  complete: '●',
};

export function SectionStatusChip({ status }: { readonly status: LaunchSectionStatus }) {
  return (
    <span className={`${styles.chip} ${styles[status]}`}>
      <span aria-hidden="true">{GLYPHS[status]}</span>
      {STATUS_TEXT[status]}
    </span>
  );
}
