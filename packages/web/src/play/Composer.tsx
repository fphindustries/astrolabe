import styles from './Composer.module.css';

/**
 * §8's action composer: relevant moves, the freeform "what do you do?" box,
 * and the What now?, Ask Guide, and Oracle controls. Built out in group 6.
 * Capped at `--composer-max` so a growing textarea squeezes the log rather
 * than the page (D-40).
 */
export function Composer() {
  return <div className={styles.composer}>Move panel and action input — bound in group 6.</div>;
}
