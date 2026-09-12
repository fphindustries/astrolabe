import { STARFORGED, type CharacterId } from '@astrolabe/rules';

import { useCampaignState } from '../../api/campaigns.js';
import { Drawer } from '../../ui/Drawer.js';
import { Meter } from '../../ui/Meter.js';
import { Signed } from '../../ui/Signed.js';

import { toCharacterSheet } from './crew.js';
import styles from './CharacterDrawer.module.css';

/**
 * §8: clicking a crew card opens this drawer (D-98). Display only —
 * editing a meter, track or clock is A16's manual-override UI, which has
 * no task yet (flagged in the plan; likely 5.7) and no move-flow controls
 * live here either (group 6).
 */
export function CharacterDrawer({
  campaignId,
  characterId,
  onClose,
}: {
  readonly campaignId: string;
  readonly characterId: CharacterId;
  readonly onClose: () => void;
}) {
  const { data } = useCampaignState(campaignId, (state) => ({
    character: state.characters[characterId],
    tracks: state.tracks,
  }));

  const character = data?.character;
  const sheet = character ? toCharacterSheet(character, STARFORGED, data.tracks) : undefined;

  return (
    <Drawer open onClose={onClose} title={sheet?.name ?? 'Character'} side="right">
      {sheet === undefined ? (
        <p className={styles.empty}>Loading…</p>
      ) : (
        <>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Stats</h3>
            <div className={styles.row}>
              {sheet.stats.map((stat) => (
                <div key={stat.id} className={styles.stat}>
                  <span>{stat.value}</span>
                  <span className={styles.statLabel}>{stat.id}</span>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Meters</h3>
            <div className={styles.row}>
              {sheet.meters.map((meter) => (
                <Meter key={meter.id} label={meter.id} value={meter.value} max={meter.max} />
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Momentum</h3>
            <p>
              <Signed value={sheet.momentum.value} /> / {sheet.momentum.max} (reset{' '}
              {sheet.momentum.resetValue})
            </p>
            {sheet.bonusNextMove !== undefined && (
              <p>
                +{sheet.bonusNextMove.amount} on the next move
                {sheet.bonusNextMove.excludes === 'progress_moves' ? ' (not progress moves)' : ''}
              </p>
            )}
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Impacts</h3>
            {sheet.markedImpacts.length === 0 ? (
              <p className={styles.empty}>None marked.</p>
            ) : (
              <ul className={styles.list}>
                {sheet.markedImpacts.map((impact) => (
                  <li key={impact.id}>{impact.label}</li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Assets</h3>
            {sheet.assets.length === 0 ? (
              <p className={styles.empty}>None.</p>
            ) : (
              <ul className={styles.list}>
                {sheet.assets.map((asset) => (
                  <li key={asset.id}>{asset.name}</li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Vows</h3>
            {sheet.vows.length === 0 ? (
              <p className={styles.empty}>None sworn.</p>
            ) : (
              <ul className={styles.list}>
                {sheet.vows.map((vow) => (
                  <li key={vow.trackId}>
                    {vow.title} — {vow.ticks}/{vow.maxTicks}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </Drawer>
  );
}
