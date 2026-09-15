import { filledBoxes, progressBoxes } from './tracks.js';
import styles from './ProgressTrack.module.css';

/**
 * A progress track as Starforged marks it (§8, task 10.2): ten boxes, each
 * ticked stroke by stroke — a diagonal, then a cross, then a third stroke,
 * then full. The marks are shapes, so the track reads without colour (§10).
 */
export function ProgressTrack({
  title,
  ticks,
  maxTicks,
}: {
  readonly title: string;
  readonly ticks: number;
  readonly maxTicks: number;
}) {
  const boxes = progressBoxes(ticks, maxTicks);
  return (
    <span
      className={styles.track}
      role="img"
      aria-label={`${title}: ${filledBoxes(ticks)} of ${boxes.length} boxes, ${ticks} of ${maxTicks} ticks`}
    >
      {boxes.map((marked, index) => (
        <svg key={index} className={styles.box} viewBox="0 0 12 12" aria-hidden="true">
          <rect x="0.5" y="0.5" width="11" height="11" className={styles.frame} />
          {marked >= 1 && <line x1="2.5" y1="2.5" x2="9.5" y2="9.5" className={styles.mark} />}
          {marked >= 2 && <line x1="9.5" y1="2.5" x2="2.5" y2="9.5" className={styles.mark} />}
          {marked >= 3 && <line x1="6" y1="1.5" x2="6" y2="10.5" className={styles.mark} />}
          {marked >= 4 && <rect x="2.5" y="2.5" width="7" height="7" className={styles.full} />}
        </svg>
      ))}
    </span>
  );
}
