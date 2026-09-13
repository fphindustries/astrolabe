import { useRef, useState } from 'react';

import { STARFORGED, type CharacterId, type MoveId, type OutcomeTier } from '@astrolabe/rules';
import type { CommandId, InvokeMoveResponse } from '@astrolabe/shared';

import { Popover } from '../../ui/Popover.js';
import type { CrewCardView } from '../crew/crew.js';

import { BurnOfferPopover } from './BurnOfferPopover.js';
import { ChoicePrompt } from './ChoicePrompt.js';
import { DiceAnimation } from './DiceAnimation.js';
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
  onOpenPayThePrice,
  onDone,
}: {
  readonly campaignId: string;
  readonly crew: readonly CrewCardView[];
  readonly moveId: MoveId;
  readonly aidingAllyId?: CharacterId;
  readonly invoked: InvokeMoveResponse;
  readonly commandId: CommandId;
  readonly onOpenPayThePrice: (chainedFromCommandId: CommandId) => void;
  readonly onDone: () => void;
}) {
  const mathAnchorRef = useRef<HTMLButtonElement>(null);
  const [mathOpen, setMathOpen] = useState(false);
  const [choiceApplied, setChoiceApplied] = useState(false);
  const [burnedTo, setBurnedTo] = useState<OutcomeTier | null>(null);

  const move = STARFORGED.moves.find((m) => m.id === moveId);
  const tier = burnedTo ?? invoked.roll.tier;
  const isHit = tier === 'strong_hit' || tier === 'weak_hit';
  const aidedAlly = crew.find((c) => c.characterId === aidingAllyId);

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

        <button type="button" className={styles.done} onClick={onDone}>
          Done
        </button>
      </DiceAnimation>
    </div>
  );
}
