import type { EntityId } from '@astrolabe/shared';

import type { EntityCardView } from './entities.js';
import styles from './EntityCard.module.css';

/**
 * A10 / Beat 6: an AI-created NPC (or location) appears as a tracked
 * entity, badged as AI-established — `--provenance-ai`/`-player` paired
 * with a text label, never color alone (§10 NFR). Click opens the entity
 * drawer (task 5.7).
 */
export function EntityCard({
  entity,
  onOpen,
}: {
  readonly entity: EntityCardView;
  readonly onOpen: (entityId: EntityId) => void;
}) {
  return (
    <button type="button" className={styles.card} onClick={() => onOpen(entity.id)}>
      <span className={styles.name}>{entity.name}</span>
      <span className={styles.badge} data-provenance={entity.establishedBy}>
        {entity.establishedBy === 'ai' ? 'AI-established' : 'Player'}
      </span>
    </button>
  );
}
