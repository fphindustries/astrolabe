import type { CharacterId } from '@astrolabe/rules';

import type { CrewCardView } from './crew.js';
import { CrewCard } from './CrewCard.js';
import styles from './CrewRail.module.css';

/**
 * The left rail's crew section (§8, D-42). D-97: rails never scroll, and
 * six cards must fit at the 1280×720 minimum, so a rail that would
 * overflow past that truncates rather than growing a scrollbar. Milestone 1
 * only ever has three crew, so this is headroom rather than something the
 * golden session exercises.
 */
const MAX_VISIBLE = 6;

export function CrewRail({
  crew,
  onOpen,
}: {
  readonly crew: readonly CrewCardView[];
  readonly onOpen: (characterId: CharacterId) => void;
}) {
  const visible = crew.slice(0, MAX_VISIBLE);
  const overflow = crew.length - visible.length;

  return (
    <div className={styles.rail}>
      {visible.map((card) => (
        <CrewCard key={card.characterId} crew={card} onOpen={onOpen} />
      ))}
      {overflow > 0 && <div className={styles.overflow}>+{overflow} more</div>}
    </div>
  );
}
