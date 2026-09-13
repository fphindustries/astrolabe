import type { BurnOffer } from '@astrolabe/rules';

import { useBurnMomentum } from '../../api/moves.js';

import styles from './BurnOfferPopover.module.css';

const TIER_LABEL: Record<string, string> = {
  strong_hit: 'a strong hit',
  weak_hit: 'a weak hit',
  miss: 'a miss',
};

/**
 * Task 6.7, A8, Beat 5: "a rule the player didn't think to ask about,
 * surfaced when it matters." The offer itself was already computed
 * server-side (`computeBurnOffer`, inside `resolveActionMove`) — this only
 * displays it and, on accept, calls the one endpoint that spends it.
 */
export function BurnOfferPopover({
  campaignId,
  rollEventId,
  offer,
  onBurned,
}: {
  readonly campaignId: string;
  readonly rollEventId: string;
  readonly offer: BurnOffer;
  readonly onBurned: () => void;
}) {
  const burn = useBurnMomentum(campaignId);

  return (
    <div className={styles.offer}>
      <p className={styles.text}>
        Burn momentum to upgrade to {TIER_LABEL[offer.wouldBecome] ?? offer.wouldBecome}? Momentum
        resets to {offer.resetsTo}.
      </p>
      <button
        type="button"
        className={styles.accept}
        disabled={burn.isPending}
        onClick={() => {
          burn.mutate(rollEventId, { onSuccess: onBurned });
        }}
      >
        {burn.isPending ? 'Burning…' : 'Burn momentum'}
      </button>
    </div>
  );
}
