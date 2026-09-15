import { momentumCells } from './tracks.js';
import styles from './MomentumScale.module.css';

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/**
 * Momentum as a scale (§8, task 10.2): one cell per point from −6 to its
 * maximum, filled from zero toward the value, with its reset point notched.
 * The signed value is always written beside it.
 */
export function MomentumScale({
  value,
  min,
  max,
  reset,
  compact = false,
}: {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly reset?: number;
  readonly compact?: boolean;
}) {
  return (
    <span
      className={styles.momentum}
      data-compact={compact}
      role="img"
      aria-label={`Momentum ${signed(value)} of ${signed(max)}${reset === undefined ? '' : `, resets to ${signed(reset)}`}`}
    >
      <span className={styles.cells} aria-hidden="true">
        {momentumCells(value, min, max, reset).map((cell) => (
          <span
            key={cell.value}
            className={styles.cell}
            data-filled={cell.filled}
            data-negative={cell.value < 0}
            data-zero={cell.value === 0}
            data-current={cell.current}
            data-reset={cell.reset}
          />
        ))}
      </span>
      <span className={styles.value} aria-hidden="true">
        {signed(value)}
      </span>
    </span>
  );
}
