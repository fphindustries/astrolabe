import { STARFORGED, type AssetId, type CharacterId } from '@astrolabe/rules';

import { useCampaignState } from '../../api/campaigns.js';
import { Drawer } from '../../ui/Drawer.js';
import { OverrideControl } from '../overrides/OverrideControl.js';

import { toCharacterSheet } from './crew.js';
import styles from './CharacterDrawer.module.css';

/**
 * §8: clicking a crew card opens this drawer (D-98). Meters and momentum
 * are editable by hand here (A16, D-117), marked "edited" once they are.
 * `onOpenAsset` opens task 5.7's asset drawer for full ability text.
 */
export function CharacterDrawer({
  campaignId,
  characterId,
  onClose,
  onOpenAsset,
}: {
  readonly campaignId: string;
  readonly characterId: CharacterId;
  readonly onClose: () => void;
  readonly onOpenAsset: (assetId: AssetId) => void;
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
                <OverrideControl
                  key={meter.id}
                  campaignId={campaignId}
                  target={{ kind: 'meter', characterId, meter: meter.id }}
                  label={meter.id}
                  value={meter.value}
                  min={meter.min}
                  max={meter.max}
                  overridden={meter.overridden}
                  format={(value) => `${value}/${meter.max}`}
                />
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Momentum</h3>
            <p>
              <OverrideControl
                campaignId={campaignId}
                target={{ kind: 'momentum', characterId }}
                label="Momentum"
                value={sheet.momentum.value}
                min={sheet.momentum.min}
                max={sheet.momentum.max}
                overridden={sheet.momentum.overridden}
                format={(value) => `${value >= 0 ? '+' : ''}${value} / ${sheet.momentum.max}`}
              />{' '}
              (reset {sheet.momentum.resetValue})
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
                  <li key={asset.id}>
                    <button
                      type="button"
                      className={styles.assetButton}
                      onClick={() => onOpenAsset(asset.id)}
                    >
                      {asset.name}
                    </button>
                  </li>
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

          {sheet.hooks.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Backstory</h3>
              <ul className={styles.list}>
                {sheet.hooks.map((hook, index) => (
                  <li key={index}>{hook}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </Drawer>
  );
}
