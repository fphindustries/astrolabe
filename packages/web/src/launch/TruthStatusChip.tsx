import { TRUTH_STATUS_TEXT, type TruthStatus } from './truths.js';
import styles from './TruthStatusChip.module.css';

/**
 * One truth's status: a shape and a word, never a colour alone (section 10).
 *
 * The glyph is decorative and hidden from assistive technology — the word
 * beside it is the status, so a screen reader hears "Left open" rather than
 * "circle Left open".
 */
const GLYPHS: Readonly<Record<TruthStatus, string>> = {
  not_decided: '○',
  answered: '●',
  left_open: '◍',
  needs_attention: '!',
};

export function TruthStatusChip({ status }: { readonly status: TruthStatus }) {
  return (
    <span className={`${styles.chip} ${styles[status]}`}>
      <span aria-hidden="true">{GLYPHS[status]}</span>
      {TRUTH_STATUS_TEXT[status]}
    </span>
  );
}
