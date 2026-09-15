import { meterPips } from './tracks.js';
import styles from './Meter.module.css';

/**
 * A condition meter as pips (§8, task 10.2): one per point, filled up to the
 * value. Filled and hollow differ in shape as well as colour, and the value
 * is written out too, so nothing rests on colour alone (§10).
 */
export function Meter({
  label,
  value,
  max,
  showValue = true,
  showLabel = true,
}: {
  readonly label: string;
  readonly value: number;
  readonly max: number;
  readonly showValue?: boolean;
  readonly showLabel?: boolean;
}) {
  return (
    <span className={styles.meter} role="img" aria-label={`${label} ${value} of ${max}`}>
      {showLabel && (
        <span className={styles.label} aria-hidden="true">
          {label}
        </span>
      )}
      <span className={styles.pips} aria-hidden="true">
        {meterPips(value, max).map((filled, index) => (
          <span key={index} className={styles.pip} data-filled={filled} />
        ))}
      </span>
      {showValue && (
        <span className={styles.value} aria-hidden="true">
          {value}
        </span>
      )}
    </span>
  );
}
