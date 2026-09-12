import type { CharacterId, ImpactId, MeterId, MoveId, OracleId, TrackId } from './ids.js';
import type { OutcomeTier } from './moves.js';

/**
 * The automation layer: hand-authored, keyed to Astrolabe IDs, and entirely
 * separate from the imported layer in moves.ts.
 *
 * Datasworn move outcomes are prose only — there is no `{ momentum: +1 }`
 * anywhere in the dataset, and a chain like Pay the Price's "You are
 * harmed" leading into Endure Harm exists nowhere in the data either. This
 * layer is the only place that knowledge lives, and every effect it
 * declares is paired with the exact clause of imported text it implements
 * (TracedEffect), so the "every automated rule behaviour is traceable"
 * non-negotiable is checked, not just asserted (see traceability.ts).
 *
 * D-59 scopes Milestone 1 automation to the moves the golden session
 * exercises; everything else stays at Reference until it has a spec.
 */
export type AutomationLevel = 'automated' | 'guided' | 'reference';

export interface MoveAutomation {
  readonly moveId: MoveId;
  readonly level: AutomationLevel;
  /** e.g. Endure Harm's harm intake, which precedes the roll itself. */
  readonly preRoll?: OutcomeSpec;
  readonly outcomes: Partial<Record<OutcomeTier, OutcomeSpec>>;
  /** For no_roll moves whose whole content is "choose one" — Pay the Price. */
  readonly method?: MethodSpec;
}

export interface MethodSpec {
  readonly prompt: string;
  readonly options: readonly MethodOption[];
}

export interface MethodOption {
  readonly id: string;
  readonly label: string;
  /** D-08: the table roll is the highlighted default among Pay the Price's options. */
  readonly highlighted?: boolean;
  readonly effects: readonly TracedEffect[];
  readonly chain?: ChainSpec;
  /** The bullet or sentence in the move's imported text this option implements. */
  readonly clauseRef: string;
}

export interface OutcomeSpec {
  readonly effects: readonly TracedEffect[];
  /** "Choose one…" — the player owns this (design record section 3). */
  readonly choices?: readonly Choice[];
  readonly chain?: ChainSpec;
}

export interface TracedEffect {
  readonly effect: Effect;
  /**
   * A verbatim substring of the imported text this effect implements —
   * `outcomes[tier].text` where a tier applies, `Move.text` otherwise
   * (preRoll and method clauses have no tier). Checked by
   * `isVerbatimClause` (traceability.ts).
   */
  readonly clause: string;
}

export interface Choice {
  readonly id: string;
  readonly prompt: string;
  readonly pick: { readonly min: number; readonly max: number };
  /** Endure Harm's weak hit is a "you may". */
  readonly optional?: boolean;
  readonly options: readonly ChoiceOption[];
}

export interface ChoiceOption {
  readonly id: string;
  readonly label: string;
  readonly effects: readonly TracedEffect[];
  /** e.g. "If you are not wounded" */
  readonly available?: Condition;
}

/** D-62: who an effect applies to. Set to 'aided_ally' when a move invocation carries an aidingAllyId. */
export type EffectTarget = 'actor' | 'aided_ally';

export type Effect =
  | { readonly kind: 'momentum'; readonly delta: number; readonly target: EffectTarget }
  | { readonly kind: 'momentum_reset'; readonly target: EffectTarget }
  | {
      readonly kind: 'meter';
      readonly meter: MeterId;
      readonly delta: number;
      readonly target: EffectTarget;
    }
  | {
      readonly kind: 'bonus_next_move';
      readonly amount: number;
      readonly excludes?: 'progress_moves';
      readonly target: EffectTarget;
    }
  | { readonly kind: 'progress'; readonly track: TrackRef; readonly ticks: number }
  | {
      readonly kind: 'impact';
      readonly impact: ImpactId;
      readonly set: boolean;
      readonly target: EffectTarget;
    }
  | { readonly kind: 'oracle_roll'; readonly oracle: OracleId }
  | {
      /** D-16 / A13: the AI proposes a number from the fiction; only the player can commit it. */
      readonly kind: 'proposed_amount';
      readonly of: 'meter';
      readonly meter: MeterId;
      readonly range: readonly [number, number];
      readonly proposedBy: 'ai';
      readonly adjustableBy: 'player';
    };

export type ChainMode = 'auto' | 'offer';

export type ChainSpec =
  | { readonly mode: ChainMode; readonly reason: string; readonly to: MoveId }
  | {
      readonly mode: ChainMode;
      readonly reason: string;
      readonly fromOracle: OracleId;
      readonly rows: readonly OracleChainRow[];
    };

export interface OracleChainRow {
  readonly min: number;
  readonly max: number;
  readonly to: MoveId;
}

/** Which track an effect moves. Vows, expeditions and clocks are all tracks. */
export type TrackRef =
  | { readonly scope: 'vow'; readonly trackId: TrackId }
  | { readonly scope: 'clock'; readonly trackId: TrackId }
  | { readonly scope: 'legacy'; readonly track: 'quests' | 'bonds' | 'discoveries' }
  | { readonly scope: 'current_move_target' };

/** Guards on choice options. Evaluated against projected character state. */
export type Condition =
  | { readonly hasImpact: ImpactId }
  | { readonly meterAtMin: MeterId }
  | { readonly meterAtMax: MeterId }
  | { readonly not: Condition }
  | { readonly all: readonly Condition[] }
  | { readonly any: readonly Condition[] };

/**
 * D-62: Aid Your Ally is not its own automation spec — it is `no_roll` in
 * the data and its whole text redirects another move's benefits. So it is
 * a flag on the invocation: when `aidingAllyId` is set and the tier is a
 * hit, effects targeting 'actor' resolve to the aided character instead.
 */
export interface MoveInvocation {
  readonly moveId: MoveId;
  readonly actorId: CharacterId;
  readonly aidingAllyId?: CharacterId;
}
