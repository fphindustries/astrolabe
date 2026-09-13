import { useState } from 'react';

import {
  MOVE_AUTOMATION_SPECS,
  STARFORGED,
  type CharacterId,
  type MoveId,
  type RollOption,
} from '@astrolabe/rules';
import type { CommandId } from '@astrolabe/shared';

import { useInvokeMove } from '../../api/moves.js';
import { useCampaignState } from '../../api/campaigns.js';
import type { CrewCardView } from '../crew/crew.js';

import { AidAllyPicker } from './AidAllyPicker.js';
import { useMoveFlowActions } from './move-flow.js';
import styles from './MoveComposer.module.css';

type StatOrMeterOption = Extract<RollOption, { using: 'stat' | 'condition_meter' }>;

function rollOptionsFor(moveId: MoveId): readonly StatOrMeterOption[] {
  const move = STARFORGED.moves.find((m) => m.id === moveId);
  if (move === undefined) {
    return [];
  }
  return move.trigger.conditions
    .flatMap((condition) => condition.rollOptions)
    .filter((option): option is StatOrMeterOption => option.using === 'stat' || option.using === 'condition_meter');
}

function optionLabel(option: StatOrMeterOption): string {
  return option.using === 'stat' ? option.stat : option.meter;
}

function optionKey(option: StatOrMeterOption): string {
  return `${option.using}:${optionLabel(option)}`;
}

/**
 * The composing panel (tasks 6.2, 6.3, 6.9): picks how to roll, who to aid,
 * the freeform action text, and — for a move with a `preRoll` (Endure
 * Harm) — the harm amount, before ever calling the server.
 */
export function MoveComposer({
  campaignId,
  moveId,
  actorCharacterId,
  chainedFromCommandId,
  crew,
  onResolved,
  onCancel,
}: {
  readonly campaignId: string;
  readonly moveId: MoveId;
  readonly actorCharacterId: CharacterId;
  readonly chainedFromCommandId?: CommandId;
  readonly crew: readonly CrewCardView[];
  readonly onResolved: () => void;
  readonly onCancel: () => void;
}) {
  const move = STARFORGED.moves.find((m) => m.id === moveId);
  const automation = MOVE_AUTOMATION_SPECS.get(moveId);
  const rollOptions = rollOptionsFor(moveId);
  const preRollEffect = automation?.preRoll?.effects.find((e) => e.effect.kind === 'proposed_amount')?.effect;
  const preRollRange = preRollEffect?.kind === 'proposed_amount' ? preRollEffect.range : undefined;
  const placeholderAmount =
    preRollRange !== undefined ? Math.round((preRollRange[0] + preRollRange[1]) / 2) : undefined;

  const actor = useCampaignState(campaignId, (state) => state.characters[actorCharacterId]);
  const { moveResolved } = useMoveFlowActions();
  const invoke = useInvokeMove(campaignId);

  const [selectedOption, setSelectedOption] = useState<string | undefined>(
    rollOptions[0] !== undefined ? optionKey(rollOptions[0]) : undefined,
  );
  const [actionText, setActionText] = useState('');
  const [aidingAllyId, setAidingAllyId] = useState<CharacterId | undefined>(undefined);
  const [addLabel, setAddLabel] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const [harmAmount, setHarmAmount] = useState(placeholderAmount ?? 0);

  if (move === undefined || automation === undefined) {
    return null;
  }

  const applicableAbilities = (actor.data?.assets ?? []).flatMap((assetId) => {
    const asset = STARFORGED.assets.find((a) => a.id === assetId);
    return (asset?.abilities ?? []).filter((ability) => ability.enhances.includes(moveId));
  });

  const chosen = rollOptions.find((option) => optionKey(option) === selectedOption);
  const extraAdds =
    addLabel.trim().length > 0 && addAmount.trim().length > 0 && !Number.isNaN(Number(addAmount))
      ? [{ amount: Number(addAmount), label: addLabel.trim() }]
      : [];

  async function submit() {
    const invoked = await invoke.mutateAsync({
      moveId,
      actorCharacterId,
      ...(aidingAllyId !== undefined ? { aidingAllyId } : {}),
      ...(chosen !== undefined
        ? {
            using:
              chosen.using === 'stat'
                ? { using: 'stat' as const, stat: chosen.stat }
                : { using: 'condition_meter' as const, meter: chosen.meter },
          }
        : {}),
      adds: extraAdds,
      ...(actionText.trim().length > 0 ? { actionText: actionText.trim() } : {}),
      ...(preRollRange !== undefined ? { preRollAmount: harmAmount } : {}),
      ...(chainedFromCommandId !== undefined ? { chainedFromCommandId } : {}),
    });
    moveResolved(moveId, actorCharacterId, invoked.response, invoked.commandId, aidingAllyId);
    onResolved();
  }

  return (
    <div className={styles.composer}>
      <div className={styles.header}>
        <span className={styles.moveName}>{move.name}</span>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className={styles.trigger}>{move.trigger.text}</p>

      {rollOptions.length > 1 && (
        <fieldset className={styles.rollOptions}>
          <legend>Roll with</legend>
          {rollOptions.map((option) => (
            <label key={optionKey(option)} className={styles.radio}>
              <input
                type="radio"
                name="roll-option"
                checked={selectedOption === optionKey(option)}
                onChange={() => setSelectedOption(optionKey(option))}
              />
              {optionLabel(option)}
            </label>
          ))}
        </fieldset>
      )}

      {applicableAbilities.length > 0 && (
        <div className={styles.abilities}>
          {applicableAbilities.map((ability) => (
            <p key={ability.id} className={styles.abilityText}>
              {ability.text}
            </p>
          ))}
          <div className={styles.addRow}>
            <input
              type="text"
              placeholder="What applies (e.g. asset bonus)"
              value={addLabel}
              onChange={(event) => setAddLabel(event.target.value)}
              className={styles.addLabel}
            />
            <input
              type="number"
              placeholder="+/-"
              value={addAmount}
              onChange={(event) => setAddAmount(event.target.value)}
              className={styles.addAmount}
            />
          </div>
        </div>
      )}

      {preRollRange !== undefined && (
        <label className={styles.field}>
          <span className={styles.label}>
            Harm amount (placeholder — no AI proposal yet, adjust as the fiction calls for)
          </span>
          <input
            type="number"
            min={preRollRange[0]}
            max={preRollRange[1]}
            value={harmAmount}
            onChange={(event) => setHarmAmount(Number(event.target.value))}
          />
        </label>
      )}

      <AidAllyPicker
        crew={crew}
        actorCharacterId={actorCharacterId}
        aidingAllyId={aidingAllyId}
        onChange={setAidingAllyId}
      />

      <label className={styles.field}>
        <span className={styles.label}>What do you do?</span>
        <textarea
          className={styles.actionText}
          value={actionText}
          onChange={(event) => setActionText(event.target.value)}
          placeholder="Describe the action…"
        />
      </label>

      <button
        type="button"
        className={styles.roll}
        disabled={invoke.isPending}
        onClick={() => void submit()}
      >
        {invoke.isPending ? 'Rolling…' : 'Roll'}
      </button>
    </div>
  );
}
