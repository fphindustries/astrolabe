import { useState } from 'react';

import { STARFORGED, type MoveId } from '@astrolabe/rules';

import { Drawer } from '../../ui/Drawer.js';

import { moveDetail, movesByCategory } from './moves.js';
import styles from './MoveDrawer.module.css';

/**
 * The full moves reference browser (task 5.7, D-104): list grouped by
 * category, one click into a move's trigger/outcome text. Task 6.1's
 * relevant-moves panel links to this same drawer later ("the full list one
 * click away") instead of rebuilding it — this session's entry point is a
 * small button in the top bar.
 */
export function MoveDrawer({ onClose }: { readonly onClose: () => void }) {
  const [selectedId, setSelectedId] = useState<MoveId | null>(null);
  const groups = movesByCategory(STARFORGED.moves);
  const selected = STARFORGED.moves.find((move) => move.id === selectedId);
  const detail = selected === undefined ? undefined : moveDetail(selected, STARFORGED.oracles);

  return (
    <Drawer open onClose={onClose} title={detail?.name ?? 'Moves'} side="right">
      {detail !== undefined ? (
        <div>
          <button type="button" className={styles.back} onClick={() => setSelectedId(null)}>
            ← All moves
          </button>
          <p className={styles.trigger}>{detail.triggerText}</p>
          {detail.outcomes.map((outcome) => (
            <div key={outcome.tier} className={styles.outcome}>
              <h4 className={styles.outcomeTier}>{outcome.tier.replace(/_/g, ' ')}</h4>
              <p>{outcome.text}</p>
            </div>
          ))}
          {detail.embeddedOracleNames.length > 0 && (
            <p className={styles.oracles}>Oracles: {detail.embeddedOracleNames.join(', ')}</p>
          )}
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.category} className={styles.section}>
            <h3 className={styles.sectionTitle}>{group.label}</h3>
            <ul className={styles.list}>
              {group.moves.map((move) => (
                <li key={move.id}>
                  <button
                    type="button"
                    className={styles.moveButton}
                    onClick={() => setSelectedId(move.id)}
                  >
                    {move.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </Drawer>
  );
}
