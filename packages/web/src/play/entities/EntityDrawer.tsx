import type { EntityId } from '@astrolabe/shared';

import { useCampaignState, useEntityGrounding } from '../../api/campaigns.js';
import { Drawer } from '../../ui/Drawer.js';

import { toChipView } from '../log/entries.js';
import { OracleChips } from '../oracle/OracleChips.js';

import { fieldLabel } from './entities.js';
import styles from './EntityDrawer.module.css';

/**
 * Task 5.7's NPC/location drawer, opened from an `EntityCard` click.
 * `fields` is rendered generically (label/value rows) since it's an open
 * bag driven by the recipe that established the entity, not a fixed schema
 * (`entity.established`'s comment). Its oracle rolls show as chips (8.5),
 * fetched from the grounding route, with any a reroll discarded (D-70).
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
  const grounded = (entity?.provenance.groundedIn.length ?? 0) > 0;
  const grounding = useEntityGrounding(campaignId, entityId);

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
                    <dt className={styles.fieldKey}>{fieldLabel(key)}</dt>
                    <dd className={styles.fieldValue}>{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          {grounded && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Grounded in</h3>
              {grounding.data === undefined ? (
                <p className={styles.empty}>
                  {grounding.isError ? 'The rolls could not be loaded.' : 'Loading the rolls…'}
                </p>
              ) : (
                <OracleChips chips={grounding.data.chips.map(toChipView)} />
              )}
            </section>
          )}
        </>
      )}
    </Drawer>
  );
}
