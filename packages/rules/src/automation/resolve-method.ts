import type {
  ChainSpec,
  MethodOption,
  MoveAutomation,
  TracedEffect,
} from '../schema/automation.js';

export interface ResolvedMethod {
  readonly effects: readonly TracedEffect[];
  readonly chain: ChainSpec | undefined;
}

/**
 * A no_roll move's whole content is "choose one" (Pay the Price, Ask the
 * Oracle) — there is no dice roll or tier here, just the option the player
 * picked.
 */
export function resolveMethodOption(automation: MoveAutomation, optionId: string): ResolvedMethod {
  const option: MethodOption | undefined = automation.method?.options.find(
    (o) => o.id === optionId,
  );
  if (option === undefined) {
    throw new Error(`No method option "${optionId}" on move "${automation.moveId}"`);
  }
  return { effects: option.effects, chain: option.chain };
}
