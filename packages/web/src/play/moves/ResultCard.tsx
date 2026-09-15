import { useEffect, useRef, useState } from 'react';

import {
  STARFORGED,
  complicationFor,
  type CharacterId,
  type MoveId,
  type OutcomeTier,
} from '@astrolabe/rules';
import type { CheckTriggerResponse, CommandId, InvokeMoveResponse } from '@astrolabe/shared';

import { useCheckTrigger } from '../../api/moves.js';

import { Popover } from '../../ui/Popover.js';
import type { CrewCardView } from '../crew/crew.js';

import { BurnOfferPopover } from './BurnOfferPopover.js';
import { ChoicePrompt } from './ChoicePrompt.js';
import { ComplicationPrompt } from './ComplicationPrompt.js';
import { DiceAnimation } from './DiceAnimation.js';
import { TriggerNote } from './TriggerNote.js';
import styles from './ResultCard.module.css';

const TIER_LABEL: Record<OutcomeTier, string> = {
  strong_hit: 'Strong hit',
  weak_hit: 'Weak hit',
  miss: 'Miss',
};

/**
 * Task 6.5 (D-20): the outcome leads, the dice math is a click away. Also
 * the home for 6.6's choice prompt, 6.7's burn offer, and 6.9's Aid Your
 * Ally explanation — all of a kind with "further decisions about the roll
 * this card is already showing," not separate flow steps (move-flow.tsx's
 * own comment).
 */
export function ResultCard({
  campaignId,
  crew,
  moveId,
  aidingAllyId,
  invoked,
  commandId,
  checkTrigger = false,
  onOpenPayThePrice,
  onDone,
}: {
  readonly campaignId: string;
  readonly crew: readonly CrewCardView[];
  readonly moveId: MoveId;
  readonly aidingAllyId?: CharacterId;
  readonly invoked: InvokeMoveResponse;
  readonly commandId: CommandId;
  /** D-136: ask, in the background, whether the move's trigger fits the typed action. */
  readonly checkTrigger?: boolean;
  readonly onOpenPayThePrice: (chainedFromCommandId: CommandId) => void;
  readonly onDone: () => void;
}) {
  const mathAnchorRef = useRef<HTMLButtonElement>(null);
  const [mathOpen, setMathOpen] = useState(false);
  const [choiceApplied, setChoiceApplied] = useState(false);
  const [burnedTo, setBurnedTo] = useState<OutcomeTier | null>(null);
  const [triggerCheck, setTriggerCheck] = useState<CheckTriggerResponse | undefined>(undefined);
  const [complicationSet, setComplicationSet] = useState<string | null>(null);
  const check = useCheckTrigger(campaignId);
  const checkAsked = useRef(false);

  useEffect(() => {
    // Once, after the roll is already on screen: nothing here waits on it (A18).
    if (!checkTrigger || checkAsked.current) {
      return;
    }
    checkAsked.current = true;
    check.mutate(commandId, { onSuccess: setTriggerCheck });
  }, [checkTrigger, check, commandId]);

  const move = STARFORGED.moves.find((m) => m.id === moveId);
  const tier = burnedTo ?? invoked.roll.tier;
  const isHit = tier === 'strong_hit' || tier === 'weak_hit';
  const aidedAlly = crew.find((c) => c.characterId === aidingAllyId);
  // D-143: read from the rules at the tier the roll now stands at, so a burn
  // that lifts a weak hit to a strong hit lifts the requirement too.
  const complication = complicationFor(moveId, tier);
  const owesComplication = complication !== undefined && complicationSet === null;

  return (
    <div className={styles.card} data-tier={tier}>
      <DiceAnimation>
        <div className={styles.headline}>
          <span className={styles.moveName}>{move?.name ?? moveId}</span>
          <span className={styles.tier}>{TIER_LABEL[tier]}</span>
          {invoked.roll.isMatch && <span className={styles.match}>Match</span>}
        </div>

        <button
          ref={mathAnchorRef}
          type="button"
          className={styles.mathToggle}
          onClick={() => setMathOpen((open) => !open)}
        >
          {mathOpen ? 'Hide math' : 'Show math'}
        </button>
        <Popover open={mathOpen} onClose={() => setMathOpen(false)} anchorRef={mathAnchorRef}>
          <dl className={styles.math}>
            <dt>Action die</dt>
            <dd>{invoked.roll.actionDie}</dd>
            {invoked.roll.adds.map((add, index) => (
              <div className={styles.mathRow} key={`${add.label}-${index}`}>
                <dt>{add.label}</dt>
                <dd>{add.amount >= 0 ? `+${add.amount}` : add.amount}</dd>
              </div>
            ))}
            <dt>Action score</dt>
            <dd>{invoked.roll.actionScore}</dd>
            <dt>Challenge dice</dt>
            <dd>{invoked.roll.challengeDice.join(', ')}</dd>
          </dl>
        </Popover>

        {triggerCheck?.ok === true && !triggerCheck.fits && (
          <TriggerNote note={triggerCheck.note} />
        )}

        {aidedAlly !== undefined && isHit && (
          <p className={styles.aidNote}>Aid Your Ally: the benefits go to {aidedAlly.callsign}.</p>
        )}

        {burnedTo === null && invoked.roll.burnOffer !== undefined && (
          <BurnOfferPopover
            campaignId={campaignId}
            rollEventId={invoked.rollEventId}
            offer={invoked.roll.burnOffer}
            onBurned={() => setBurnedTo(invoked.roll.burnOffer?.wouldBecome ?? null)}
          />
        )}

        {!choiceApplied && invoked.pendingChoice !== undefined && (
          <ChoicePrompt
            campaignId={campaignId}
            choice={invoked.pendingChoice}
            onApplied={() => setChoiceApplied(true)}
          />
        )}

        {complication !== undefined &&
          (complicationSet === null ? (
            <ComplicationPrompt
              campaignId={campaignId}
              moveCommandId={commandId}
              clause={complication.clause}
              onSet={(_result, text) => setComplicationSet(text)}
            />
          ) : (
            <p className={styles.aidNote}>Complication: {complicationSet}</p>
          ))}

        {invoked.chain !== undefined && (
          <div className={styles.chain}>
            <p className={styles.chainReason}>{invoked.chain.reason}</p>
            {invoked.chain.mode === 'offer' && (
              <button
                type="button"
                className={styles.payThePrice}
                onClick={() => onOpenPayThePrice(commandId)}
              >
                Pay the Price
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          className={styles.done}
          onClick={onDone}
          disabled={owesComplication}
          title={owesComplication ? 'Set the complication first.' : undefined}
        >
          Done
        </button>
        {owesComplication && (
          <p className={styles.aidNote}>Set the complication to finish the move.</p>
        )}
      </DiceAnimation>
    </div>
  );
}
