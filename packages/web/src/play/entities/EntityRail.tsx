import type { EntityId } from '@astrolabe/shared';

import type { EntityCardView } from './entities.js';
import { EntityCard } from './EntityCard.js';
import styles from './EntityRail.module.css';

/**
 * The left rail's "present NPCs" section (§8's layout table), alongside
 * `CrewRail`. Mirrors its truncation exactly (D-97) — Milestone 1's golden
 * session only ever has one or two entities live at once, so like
 * `CrewRail`'s own six-card budget, this is headroom rather than something
 * the golden session exercises; the overflow marker stays static text
 * rather than wiring a browse-all drawer that would never open.
 */
const MAX_VISIBLE = 6;

export function EntityRail({
  entities,
  onOpen,
}: {
  readonly entities: readonly EntityCardView[];
  readonly onOpen: (entityId: EntityId) => void;
}) {
  if (entities.length === 0) {
    return null;
  }

  const visible = entities.slice(0, MAX_VISIBLE);
  const overflow = entities.length - visible.length;

  return (
    <div className={styles.rail}>
      <h3 className={styles.title}>Present</h3>
      {visible.map((entity) => (
        <EntityCard key={entity.id} entity={entity} onOpen={onOpen} />
      ))}
      {overflow > 0 && <div className={styles.overflow}>+{overflow} more</div>}
    </div>
  );
}
