import { clockSegments, segmentPath } from './tracks.js';
import styles from './Clock.module.css';

/**
 * A clock as a segmented circle (§8, task 10.2): wedges filled clockwise
 * from the top, every segment outlined so an empty one still shows. The
 * accessible name carries the count.
 */
export function Clock({
  title,
  filled,
  segments,
  size = 22,
}: {
  readonly title: string;
  readonly filled: number;
  readonly segments: number;
  readonly size?: number;
}) {
  return (
    <svg
      className={styles.clock}
      width={size}
      height={size}
      viewBox="-1 -1 22 22"
      role="img"
      aria-label={`${title}: ${filled} of ${segments} segments filled`}
    >
      {clockSegments(filled, segments).map((isFilled, index) => (
        <path
          key={index}
          d={segmentPath(index, segments, 10)}
          className={styles.segment}
          data-filled={isFilled}
        />
      ))}
    </svg>
  );
}
