import type { EntityId } from '@astrolabe/shared';

import { useCampaignState } from '../../api/campaigns.js';
import { Drawer } from '../../ui/Drawer.js';

import styles from './EntityDrawer.module.css';

/**
 * Task 5.7's NPC/location drawer, opened from an `EntityCard` click.
 * `fields` is rendered generically (label/value rows) since it's an open
 * bag driven by the recipe that established the entity, not a fixed schema
 * (`entity.established`'s comment). `groundedIn` is shown as a count only —
 * no per-roll detail exists yet, since no `oracle.rolled` event type has
 * landed (task 8.1).
 */
export function EntityDrawer({
  campaignId,
  entityId,
  onClose,
}: {
  readonly campaignId: string;
  readonly entityId: EntityId;
  readonly onClose: () => void;
}) {
  const { data: entity } = useCampaignState(campaignId, (state) => state.entities[entityId]);

  return (
    <Drawer open onClose={onClose} title={entity?.name ?? 'Entity'} side="right">
      {entity === undefined ? (
        <p className={styles.empty}>Loading…</p>
      ) : (
        <>
          <p className={styles.badge} data-provenance={entity.provenance.establishedBy}>
            {entity.provenance.establishedBy === 'ai' ? 'AI-established' : 'Player-established'}
          </p>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Details</h3>
            {Object.keys(entity.fields).length === 0 ? (
              <p className={styles.empty}>No details recorded.</p>
            ) : (
              <dl className={styles.fields}>
                {Object.entries(entity.fields).map(([key, value]) => (
                  <div key={key} className={styles.field}>
                    <dt className={styles.fieldKey}>{key}</dt>
                    <dd className={styles.fieldValue}>{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          {entity.provenance.groundedIn.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Grounded in</h3>
              <p className={styles.empty}>
                {entity.provenance.groundedIn.length} oracle roll
                {entity.provenance.groundedIn.length === 1 ? '' : 's'}
              </p>
            </section>
          )}
        </>
      )}
    </Drawer>
  );
}
