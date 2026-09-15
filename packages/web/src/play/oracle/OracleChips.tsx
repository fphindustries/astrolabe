import { withoutLinks } from '@astrolabe/rules';

import type { ChipView } from '../log/entries.js';

import styles from './OracleChips.module.css';

/**
 * D-17: oracle rolls as chips, under the passage they grounded or in the
 * drawer of the entity they built (8.5). A discarded roll stays, struck
 * through, with the reroll's reason (D-18, D-70) — in words as well as style.
 */
export function OracleChips({ chips }: { readonly chips: readonly ChipView[] }) {
  return (
    <ul className={styles.chips} aria-label="Oracle rolls">
      {chips.map((chip) => (
        <li key={chip.eventId} className={styles.chip} data-struck={chip.struck}>
          <span className={styles.label}>{chip.label}</span> {withoutLinks(chip.rowText)}{' '}
          <span className={styles.roll}>({chip.roll})</span>
          {chip.struck &&
            (chip.discardedBecause !== undefined ? (
              <span className={styles.reason}> discarded: {chip.discardedBecause}</span>
            ) : (
              <span className={styles.srOnly}> (discarded)</span>
            ))}
        </li>
      ))}
    </ul>
  );
}
