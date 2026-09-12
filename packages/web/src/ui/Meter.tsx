import styles from './Meter.module.css';

/**
 * A labelled value/max pair, always shown as text. The purpose-built bar
 * and clock treatments (§8, task 10.2) replace this rendering later; the
 * label-plus-number contract stays, since §10 requires meaning never rest
 * on color alone.
 */
export function Meter({
  label,
  value,
  max,
}: {
  readonly label: string;
  readonly value: number;
  readonly max: number;
}) {
  return (
    <span className={styles.meter}>
      <span className={styles.label}>{label}</span>
      <span>
        {value}/{max}
      </span>
    </span>
  );
}
