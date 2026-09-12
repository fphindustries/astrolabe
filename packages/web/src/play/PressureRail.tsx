import styles from './PressureRail.module.css';

/**
 * §8's right rail: clocks, vows, and progress tracks, with detail
 * popovers. Bound to `state.tracks` in task 5.5. Priority in this rail
 * goes to clocks, vows and progress tracks (D-97); it never scrolls.
 */
export function PressureRail() {
  return <div className={styles.rail}>Clocks, vows and progress tracks — bound in task 5.5.</div>;
}
