import type { CharacterId } from '@astrolabe/rules';

import type { CrewCardView } from '../crew/crew.js';

import styles from './AidAllyPicker.module.css';

/**
 * Task 6.9: Aid Your Ally, D-62's flag on the invocation. Lists the rest
 * of the crew as the actor can help any one of them; picking one is
 * reversible right up to the roll.
 */
export function AidAllyPicker({
  crew,
  actorCharacterId,
  aidingAllyId,
  onChange,
}: {
  readonly crew: readonly CrewCardView[];
  readonly actorCharacterId: CharacterId;
  readonly aidingAllyId: CharacterId | undefined;
  readonly onChange: (aidingAllyId: CharacterId | undefined) => void;
}) {
  const allies = crew.filter((c) => c.characterId !== actorCharacterId);
  if (allies.length === 0) {
    return null;
  }

  return (
    <label className={styles.field}>
      <span className={styles.label}>Aiding an ally</span>
      <select
        className={styles.select}
        value={aidingAllyId ?? ''}
        onChange={(event) =>
          onChange(event.target.value === '' ? undefined : (event.target.value as CharacterId))
        }
      >
        <option value="">No one — rolling for myself</option>
        {allies.map((ally) => (
          <option key={ally.characterId} value={ally.characterId}>
            {ally.callsign}
          </option>
        ))}
      </select>
    </label>
  );
}
